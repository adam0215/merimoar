import { describe, expect, it, vi } from "vitest";
import type { ClaimedRun } from "../types";
import {
	AGENT_RUN_PUSH_SIGNATURE_HEADER,
	type AgentRunPushHost,
	createAgentRunPushHandler,
	serializeAgentRunPushPayload,
	signAgentRunPushBody,
	verifyAgentRunPushBody,
} from "./push";

const SIGNING_SECRET = "push_signing_secret_that_is_at_least_32_characters";
const NOW = 1_800_000_000_000;

function createClaim(): ClaimedRun {
	return {
		runId: "run-1",
		turnId: "turn-1",
		taskId: "task-1",
		anchorCaseId: "case-1",
		agentKey: "agent-v1",
		claimToken: "claim-1",
	};
}

async function createPushRequest(
	input: {
		runId?: string;
		sentAt?: number;
		body?: string;
		signingSecret?: string;
		signal?: AbortSignal;
	} = {},
) {
	const body =
		input.body ??
		serializeAgentRunPushPayload({
			runId: input.runId ?? "run-1",
			leaseGeneration: 0,
			deliveryId: "delivery-1",
			sentAt: input.sentAt ?? NOW,
		});
	return new Request("https://runtime.example/api/agent-runs/push", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[AGENT_RUN_PUSH_SIGNATURE_HEADER]: await signAgentRunPushBody(
				body,
				input.signingSecret ?? SIGNING_SECRET,
			),
		},
		body,
		signal: input.signal,
	});
}

function createHost(overrides: Partial<AgentRunPushHost> = {}) {
	const claimRun = vi.fn<AgentRunPushHost["claimRun"]>(async () =>
		createClaim(),
	);
	const invokeRun = vi.fn<AgentRunPushHost["invokeRun"]>(async () => {});
	const onError = vi.fn<(error: unknown) => void>();
	return {
		host: {
			claimRun,
			invokeRun,
			onError,
			...overrides,
		} satisfies AgentRunPushHost,
		claimRun,
		invokeRun,
		onError,
	};
}

function captureDeferredExecution() {
	let execution: Promise<void> | undefined;
	return {
		deferExecution(deferredExecution: Promise<void>) {
			execution = deferredExecution;
		},
		async waitForExecution() {
			if (!execution) throw new Error("No execution was deferred.");
			await execution;
		},
	};
}

describe("agent run push protocol", () => {
	it("signs and verifies the exact request body", async () => {
		const body = serializeAgentRunPushPayload({
			runId: "run-1",
			leaseGeneration: 2,
			deliveryId: "delivery-1",
			sentAt: NOW,
		});
		const signature = await signAgentRunPushBody(body, SIGNING_SECRET);

		await expect(
			verifyAgentRunPushBody(body, signature, SIGNING_SECRET),
		).resolves.toBe(true);
		await expect(
			verifyAgentRunPushBody(`${body} `, signature, SIGNING_SECRET),
		).resolves.toBe(false);
	});

	it("claims only the delivered run before invoking it", async () => {
		const fake = createHost();
		const deferred = captureDeferredExecution();
		const response = await createAgentRunPushHandler(fake.host, {
			signingSecret: SIGNING_SECRET,
			deferExecution: deferred.deferExecution,
			now: () => NOW,
		})(await createPushRequest({ runId: "run-1" }));
		await deferred.waitForExecution();

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			status: "accepted",
			runId: "run-1",
		});
		expect(fake.claimRun).toHaveBeenCalledOnce();
		expect(fake.claimRun.mock.calls[0]?.[0]).toBe("run-1");
		expect(fake.claimRun.mock.calls[0]?.[1]).toBe(0);
		expect(fake.claimRun.mock.calls[0]?.[2]).toMatch(
			/^[0-9a-f]{8}-[0-9a-f-]{27}$/,
		);
		expect(fake.invokeRun).toHaveBeenCalledWith(
			createClaim(),
			expect.any(AbortSignal),
		);
	});

	it("treats a duplicate or stale delivery as a successful no-op", async () => {
		const fake = createHost({ claimRun: async () => null });
		const response = await createAgentRunPushHandler(fake.host, {
			signingSecret: SIGNING_SECRET,
			deferExecution: () => {
				throw new Error("Duplicate delivery must not be deferred.");
			},
			now: () => NOW,
		})(await createPushRequest());

		expect(response.status).toBe(204);
		expect(fake.invokeRun).not.toHaveBeenCalled();
	});

	it("rejects tampered, expired, and structurally invalid signed payloads", async () => {
		const fake = createHost();
		const handler = createAgentRunPushHandler(fake.host, {
			signingSecret: SIGNING_SECRET,
			deferExecution: () => {
				throw new Error("Rejected delivery must not be deferred.");
			},
			now: () => NOW,
		});
		const tampered = await createPushRequest();
		const tamperedBody = `${await tampered.text()} `;
		const tamperedRequest = new Request(tampered.url, {
			method: "POST",
			headers: tampered.headers,
			body: tamperedBody,
		});
		const expired = await createPushRequest({ sentAt: NOW - 5 * 60_000 - 1 });
		const invalidBody = JSON.stringify({
			version: 1,
			runId: "run-1",
			leaseGeneration: 0,
			deliveryId: "delivery-1",
			sentAt: NOW,
			extra: true,
		});

		expect((await handler(tamperedRequest)).status).toBe(401);
		expect((await handler(expired)).status).toBe(401);
		expect(
			(await handler(await createPushRequest({ body: invalidBody }))).status,
		).toBe(400);
		expect(fake.claimRun).not.toHaveBeenCalled();
	});

	it("rejects oversized request bodies before claiming", async () => {
		const fake = createHost();
		const response = await createAgentRunPushHandler(fake.host, {
			signingSecret: SIGNING_SECRET,
			deferExecution: () => {
				throw new Error("Rejected delivery must not be deferred.");
			},
		})(
			new Request("https://runtime.example/api/agent-runs/push", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": "5000",
					[AGENT_RUN_PUSH_SIGNATURE_HEADER]: "v1=invalid",
				},
				body: "{}",
			}),
		);

		expect(response.status).toBe(413);
		expect(fake.claimRun).not.toHaveBeenCalled();
	});

	it("keeps deferred execution independent from the delivery connection", async () => {
		const controller = new AbortController();
		let finishInvocation = () => {};
		const finish = new Promise<void>((resolve) => {
			finishInvocation = resolve;
		});
		let invocationSignal: AbortSignal | undefined;
		const fake = createHost({
			async invokeRun(_claim, signal) {
				invocationSignal = signal;
				await finish;
			},
		});
		const deferred = captureDeferredExecution();
		const response = await createAgentRunPushHandler(fake.host, {
			signingSecret: SIGNING_SECRET,
			deferExecution: deferred.deferExecution,
			now: () => NOW,
		})(await createPushRequest({ signal: controller.signal }));

		controller.abort();
		finishInvocation();
		await deferred.waitForExecution();

		expect(response.status).toBe(202);
		expect(invocationSignal?.aborted).toBe(false);
	});

	it("fails closed when background execution cannot be registered", async () => {
		const fake = createHost();
		const response = await createAgentRunPushHandler(fake.host, {
			signingSecret: SIGNING_SECRET,
			deferExecution: () => {
				throw new Error("waitUntil is unavailable");
			},
			now: () => NOW,
		})(await createPushRequest());

		expect(response.status).toBe(503);
		expect(fake.invokeRun).not.toHaveBeenCalled();
		expect(fake.onError).toHaveBeenCalledOnce();
	});
});
