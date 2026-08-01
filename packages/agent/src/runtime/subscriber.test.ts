import { describe, expect, it } from "vitest";
import { AGENT_RUN_SHUTDOWN, type ClaimedRun } from "../types";
import {
	type AgentRunSubscriberHost,
	startAgentRunSubscriber,
} from "./subscriber";

function createClaim(index: number): ClaimedRun {
	return {
		runId: `run-${index}`,
		turnId: `turn-${index}`,
		taskId: `task-${index}`,
		anchorCaseId: `case-${index}`,
		agentKey: "agentV1",
		claimToken: `claim-${index}`,
	};
}

function createFakeHost(initialClaims: ClaimedRun[] = []) {
	const claims = [...initialClaims];
	const invokedRunIds: string[] = [];
	const errors: unknown[] = [];
	let onSnapshot: ((runId: string | null) => void) | undefined;
	let unsubscribed = false;
	let closed = false;

	const host: AgentRunSubscriberHost = {
		subscribeToRunnableRuns(callback) {
			onSnapshot = callback;
			callback(claims[0]?.runId ?? null);
			return () => {
				unsubscribed = true;
				onSnapshot = undefined;
			};
		},
		async claimNextRun() {
			return claims.shift() ?? null;
		},
		async invokeRun(claim) {
			invokedRunIds.push(claim.runId);
		},
		async relinquishRun() {},
		async close() {
			closed = true;
		},
		onError(error) {
			errors.push(error);
		},
	};

	return {
		host,
		invokedRunIds,
		errors,
		enqueue(claim: ClaimedRun) {
			claims.push(claim);
			onSnapshot?.(claim.runId);
		},
		emit(runId: string | null) {
			onSnapshot?.(runId);
		},
		get unsubscribed() {
			return unsubscribed;
		},
		get closed() {
			return closed;
		},
	};
}

describe("agent run subscriber", () => {
	it("drains work from the first snapshot and from a later queue update", async () => {
		const fake = createFakeHost([createClaim(1)]);
		const subscriber = startAgentRunSubscriber(fake.host);

		await subscriber.waitForIdle();
		expect(fake.invokedRunIds).toEqual(["run-1"]);

		fake.enqueue(createClaim(2));
		await subscriber.waitForIdle();
		expect(fake.invokedRunIds).toEqual(["run-1", "run-2"]);
		expect(fake.errors).toEqual([]);
		await subscriber.stop();
	});

	it("coalesces tight snapshots into one single-flight drain", async () => {
		const firstClaim = createClaim(1);
		const secondClaim = createClaim(2);
		const claims = [firstClaim, secondClaim];
		let onSnapshot: ((runId: string | null) => void) | undefined;
		let activeInvocations = 0;
		let maximumActiveInvocations = 0;
		const invokedRunIds: string[] = [];
		let releaseFirstInvocation: (() => void) | undefined;
		const firstInvocationBlocked = new Promise<void>((resolve) => {
			releaseFirstInvocation = resolve;
		});

		const subscriber = startAgentRunSubscriber({
			subscribeToRunnableRuns(callback) {
				onSnapshot = callback;
				callback(firstClaim.runId);
				return () => {};
			},
			async claimNextRun() {
				return claims.shift() ?? null;
			},
			async invokeRun(claim) {
				activeInvocations += 1;
				maximumActiveInvocations = Math.max(
					maximumActiveInvocations,
					activeInvocations,
				);
				invokedRunIds.push(claim.runId);
				if (claim.runId === firstClaim.runId) await firstInvocationBlocked;
				activeInvocations -= 1;
			},
			async relinquishRun() {},
		});

		for (let index = 0; index < 10; index += 1) {
			onSnapshot?.(secondClaim.runId);
		}
		releaseFirstInvocation?.();
		await subscriber.waitForIdle();

		expect(invokedRunIds).toEqual(["run-1", "run-2"]);
		expect(maximumActiveInvocations).toBe(1);
		await subscriber.stop();
	});

	it("runs up to the configured cap and fills a slot as soon as it is free", async () => {
		const claims = [createClaim(1), createClaim(2), createClaim(3)];
		const releases = new Map<string, () => void>();
		const invokedRunIds: string[] = [];
		let active = 0;
		let maximumActive = 0;

		const subscriber = startAgentRunSubscriber(
			{
				subscribeToRunnableRuns(callback) {
					callback(claims[0]?.runId ?? null);
					return () => {};
				},
				async claimNextRun() {
					return claims.shift() ?? null;
				},
				async invokeRun(claim) {
					active += 1;
					maximumActive = Math.max(maximumActive, active);
					invokedRunIds.push(claim.runId);
					await new Promise<void>((resolve) => {
						releases.set(claim.runId, resolve);
					});
					active -= 1;
				},
				async relinquishRun() {},
			},
			{ concurrency: 2 },
		);

		await waitUntil(() => invokedRunIds.length === 2);
		expect(invokedRunIds).toEqual(["run-1", "run-2"]);
		expect(maximumActive).toBe(2);

		releases.get("run-1")?.();
		await waitUntil(() => invokedRunIds.length === 3);
		expect(invokedRunIds).toEqual(["run-1", "run-2", "run-3"]);
		expect(maximumActive).toBe(2);

		releases.get("run-2")?.();
		releases.get("run-3")?.();
		await subscriber.waitForIdle();
		await subscriber.stop();
	});

	it("lets competing subscribers rely on one atomic claim", async () => {
		const sharedClaims = [createClaim(1)];
		const invokedRunIds: string[] = [];
		const callbacks: Array<(runId: string | null) => void> = [];
		const createHost = (): AgentRunSubscriberHost => ({
			subscribeToRunnableRuns(callback) {
				callbacks.push(callback);
				return () => {};
			},
			async claimNextRun() {
				return sharedClaims.shift() ?? null;
			},
			async invokeRun(claim) {
				invokedRunIds.push(claim.runId);
			},
			async relinquishRun() {},
		});
		const firstSubscriber = startAgentRunSubscriber(createHost());
		const secondSubscriber = startAgentRunSubscriber(createHost());

		for (const callback of callbacks) callback("run-1");
		await Promise.all([
			firstSubscriber.waitForIdle(),
			secondSubscriber.waitForIdle(),
		]);

		expect(invokedRunIds).toEqual(["run-1"]);
		await Promise.all([firstSubscriber.stop(), secondSubscriber.stop()]);
	});

	it("unsubscribes, closes the host, and ignores later snapshots", async () => {
		const fake = createFakeHost();
		const subscriber = startAgentRunSubscriber(fake.host);

		await subscriber.stop();
		fake.emit("run-after-stop");
		await subscriber.waitForIdle();

		expect(fake.unsubscribed).toBe(true);
		expect(fake.closed).toBe(true);
		expect(fake.invokedRunIds).toEqual([]);
	});

	it("unsubscribes immediately and waits for active work before closing", async () => {
		const claim = createClaim(1);
		let unsubscribed = false;
		let closed = false;
		let releaseInvocation: () => void = () => {};
		let invocationStarted = false;
		let claimed = false;
		const subscriber = startAgentRunSubscriber({
			subscribeToRunnableRuns(callback) {
				callback(claim.runId);
				return () => {
					unsubscribed = true;
				};
			},
			async claimNextRun() {
				if (claimed) return null;
				claimed = true;
				return claim;
			},
			async invokeRun() {
				invocationStarted = true;
				await new Promise<void>((resolve) => {
					releaseInvocation = resolve;
				});
			},
			async relinquishRun() {},
			async close() {
				closed = true;
			},
		});

		await waitUntil(() => invocationStarted);
		const stopping = subscriber.stop();
		expect(unsubscribed).toBe(true);
		expect(closed).toBe(false);
		releaseInvocation();
		await stopping;
		expect(closed).toBe(true);
	});

	it("relinquishes a claim that arrives after shutdown starts", async () => {
		const claim = createClaim(1);
		let resolveClaim: (claim: ClaimedRun) => void = () => {};
		const pendingClaim = new Promise<ClaimedRun>((resolve) => {
			resolveClaim = resolve;
		});
		const invoked: string[] = [];
		const relinquished: string[] = [];
		const subscriber = startAgentRunSubscriber({
			subscribeToRunnableRuns(callback) {
				callback(claim.runId);
				return () => {};
			},
			async claimNextRun() {
				return pendingClaim;
			},
			async invokeRun(activeClaim) {
				invoked.push(activeClaim.runId);
			},
			async relinquishRun(activeClaim) {
				relinquished.push(activeClaim.runId);
			},
		});

		const stopping = subscriber.stop();
		resolveClaim(claim);
		await stopping;

		expect(invoked).toEqual([]);
		expect(relinquished).toEqual(["run-1"]);
	});

	it("redacts credentials before reporting subscriber failures", async () => {
		let reportError: (error: unknown) => void = () => {};
		const reportedError = new Promise<unknown>((resolve) => {
			reportError = resolve;
		});
		const subscriber = startAgentRunSubscriber({
			subscribeToRunnableRuns(callback) {
				callback("queued-run");
				return () => {};
			},
			async claimNextRun() {
				throw new Error(
					"Provider failed at https://user:password@provider.test with runtimeSecret=private-runtime-secret",
				);
			},
			async invokeRun() {
				throw new Error("Not used");
			},
			async relinquishRun() {},
			onError: reportError,
		});

		const error = await reportedError;
		await subscriber.stop();

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(
			"Provider failed at https://[REDACTED]@provider.test with runtimeSecret=[REDACTED]",
		);
	});

	it.each([
		1, 3,
	])("recovers after %i transient claim failure(s) with bounded backoff", async (failureCount) => {
		const claim = createClaim(1);
		let attempts = 0;
		const invoked: string[] = [];
		const subscriber = startAgentRunSubscriber(
			{
				subscribeToRunnableRuns(callback) {
					callback(claim.runId);
					return () => {};
				},
				async claimNextRun() {
					attempts += 1;
					if (attempts <= failureCount) {
						throw new Error(`Transient claim ${attempts}`);
					}
					return attempts === failureCount + 1 ? claim : null;
				},
				async invokeRun(claimed) {
					invoked.push(claimed.runId);
				},
				async relinquishRun() {},
			},
			{ claimRetryInitialMs: 1, claimRetryMaxMs: 2 },
		);

		await subscriber.waitForIdle();
		expect(attempts).toBe(failureCount + 2);
		expect(invoked).toEqual(["run-1"]);
		await subscriber.stop();
	});

	it("cancels a pending claim retry during cleanup", async () => {
		let attempts = 0;
		let firstFailure: () => void = () => {};
		const failed = new Promise<void>((resolve) => {
			firstFailure = resolve;
		});
		const subscriber = startAgentRunSubscriber(
			{
				subscribeToRunnableRuns(callback) {
					callback("queued-run");
					return () => {};
				},
				async claimNextRun() {
					attempts += 1;
					firstFailure();
					throw new Error("Convex is temporarily unavailable");
				},
				async invokeRun() {},
				async relinquishRun() {},
			},
			{ claimRetryInitialMs: 25, claimRetryMaxMs: 25 },
		);

		await failed;
		await subscriber.stop();
		await new Promise((resolve) => setTimeout(resolve, 35));
		expect(attempts).toBe(1);
	});

	it("relinquishes active invocations and bounds shutdown even if a host hangs", async () => {
		const claim = createClaim(1);
		let abortReason: unknown;
		const relinquished: string[] = [];
		let started: () => void = () => {};
		const invocationStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		let claimed = false;
		const subscriber = startAgentRunSubscriber(
			{
				subscribeToRunnableRuns(callback) {
					callback(claim.runId);
					return () => {};
				},
				async claimNextRun() {
					if (claimed) return null;
					claimed = true;
					return claim;
				},
				async invokeRun(_claim, signal) {
					started();
					signal.addEventListener("abort", () => {
						abortReason = signal.reason;
					});
					await new Promise(() => {});
				},
				async relinquishRun(activeClaim) {
					relinquished.push(activeClaim.runId);
				},
			},
			{ stopTimeoutMs: 10 },
		);

		await invocationStarted;
		await subscriber.stop();
		expect(abortReason).toBe(AGENT_RUN_SHUTDOWN);
		expect(relinquished).toEqual(["run-1"]);
	});
});

async function waitUntil(predicate: () => boolean) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Promise.resolve();
	}
	throw new Error("Condition was not reached");
}
