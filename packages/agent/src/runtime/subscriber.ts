import { AGENT_RUN_SHUTDOWN, type ClaimedRun } from "../types";
import { getDiagnosticErrorMessage } from "./diagnostics";

export type AgentRunSubscriberHost = {
	subscribeToRunnableRuns(
		onSnapshot: (runId: string | null) => void,
		onError: (error: unknown) => void,
	): () => void;
	claimNextRun(claimToken: string): Promise<ClaimedRun | null>;
	invokeRun(claim: ClaimedRun, abortSignal: AbortSignal): Promise<void>;
	relinquishRun(claim: ClaimedRun): Promise<void>;
	close?(): Promise<void>;
	onError?(error: unknown): void;
};

export function startAgentRunSubscriber(
	host: AgentRunSubscriberHost,
	options: {
		concurrency?: number;
		claimRetryInitialMs?: number;
		claimRetryMaxMs?: number;
		stopTimeoutMs?: number;
	} = {},
) {
	const concurrency = options.concurrency ?? 4;
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
		throw new Error(
			"Agent subscriber concurrency must be an integer from 1 to 32.",
		);
	}
	const claimRetryInitialMs = options.claimRetryInitialMs ?? 250;
	const claimRetryMaxMs = options.claimRetryMaxMs ?? 10_000;
	const stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
	if (
		!Number.isInteger(claimRetryInitialMs) ||
		!Number.isInteger(claimRetryMaxMs) ||
		claimRetryInitialMs < 1 ||
		claimRetryMaxMs < claimRetryInitialMs ||
		!Number.isInteger(stopTimeoutMs) ||
		stopTimeoutMs < 1
	) {
		throw new Error("Agent subscriber retry and stop timeouts are invalid.");
	}

	let stopped = false;
	let drainRequested = false;
	let drainPromise: Promise<void> | undefined;
	const activeInvocations = new Map<
		Promise<void>,
		{ abortController: AbortController; claim: ClaimedRun }
	>();
	let claimFailureCount = 0;
	let claimRetry:
		| {
				timer: ReturnType<typeof setTimeout>;
				promise: Promise<void>;
				resolve: () => void;
		  }
		| undefined;

	const reportError = (error: unknown) => {
		try {
			host.onError?.(new Error(getDiagnosticErrorMessage(error)));
		} catch {}
	};
	const relinquish = async (claim: ClaimedRun) => {
		try {
			await host.relinquishRun(claim);
		} catch (error) {
			reportError(error);
		}
	};

	const requestDrain = () => {
		if (stopped) return;
		drainRequested = true;
		if (claimRetry || drainPromise || activeInvocations.size >= concurrency) {
			return;
		}

		drainPromise = drainQueue().finally(() => {
			drainPromise = undefined;
			if (drainRequested && !stopped && activeInvocations.size < concurrency) {
				requestDrain();
			}
		});
	};

	const startInvocation = (claim: ClaimedRun) => {
		const abortController = new AbortController();
		let invocation: Promise<void>;
		invocation = Promise.resolve()
			.then(() => host.invokeRun(claim, abortController.signal))
			.catch(reportError)
			.finally(() => {
				activeInvocations.delete(invocation);
				if (drainRequested) requestDrain();
			});
		activeInvocations.set(invocation, { abortController, claim });
	};

	const scheduleClaimRetry = () => {
		if (stopped || claimRetry) return;
		claimFailureCount += 1;
		const delay = Math.min(
			claimRetryInitialMs * 2 ** Math.min(claimFailureCount - 1, 20),
			claimRetryMaxMs,
		);
		let resolveRetry = () => {};
		const promise = new Promise<void>((resolve) => {
			resolveRetry = resolve;
		});
		const timer = setTimeout(() => {
			claimRetry = undefined;
			resolveRetry();
			requestDrain();
		}, delay);
		claimRetry = { timer, promise, resolve: resolveRetry };
	};

	async function drainQueue() {
		for (;;) {
			if (stopped || !drainRequested) return;
			drainRequested = false;
			while (activeInvocations.size < concurrency) {
				if (stopped) return;
				let claim: ClaimedRun | null;
				try {
					claim = await host.claimNextRun(crypto.randomUUID());
				} catch (error) {
					reportError(error);
					drainRequested = true;
					scheduleClaimRetry();
					return;
				}
				claimFailureCount = 0;
				if (stopped) {
					if (claim) await relinquish(claim);
					return;
				}
				if (!claim) break;
				startInvocation(claim);
			}

			if (activeInvocations.size >= concurrency) {
				drainRequested = true;
				return;
			}
		}
	}

	let unsubscribe = () => {};
	try {
		unsubscribe = host.subscribeToRunnableRuns((runId) => {
			if (runId) requestDrain();
		}, reportError);
	} catch (error) {
		reportError(error);
	}

	return {
		async stop() {
			if (stopped) return;
			stopped = true;
			if (claimRetry) {
				clearTimeout(claimRetry.timer);
				claimRetry.resolve();
				claimRetry = undefined;
			}
			try {
				unsubscribe();
			} catch (error) {
				reportError(error);
			}
			const active = [...activeInvocations.entries()];
			const relinquishments = active.map(
				async ([, { abortController, claim }]) => {
					abortController.abort(AGENT_RUN_SHUTDOWN);
					await relinquish(claim);
				},
			);
			const settling = Promise.allSettled([
				...(drainPromise ? [drainPromise] : []),
				...active.map(([invocation]) => invocation),
				...relinquishments,
			]);
			let stopTimer: ReturnType<typeof setTimeout> | undefined;
			await Promise.race([
				settling,
				new Promise<void>((resolve) => {
					stopTimer = setTimeout(resolve, stopTimeoutMs);
				}),
			]);
			if (stopTimer) clearTimeout(stopTimer);
			try {
				await host.close?.();
			} catch (error) {
				reportError(error);
			}
		},
		async waitForIdle() {
			for (;;) {
				const pendingDrain = drainPromise;
				const pendingRetry = claimRetry?.promise;
				const invocations = [...activeInvocations.keys()];
				if (!pendingDrain && !pendingRetry && invocations.length === 0) return;
				await Promise.all([
					...(pendingDrain ? [pendingDrain] : []),
					...(pendingRetry ? [pendingRetry] : []),
					...invocations,
				]);
			}
		},
	};
}
