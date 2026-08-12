// @vitest-environment node

import type { AgentRunPushHost, ClaimedRun } from "@merimoar/agent";
import {
	AGENT_RUN_PUSH_SIGNATURE_HEADER,
	serializeAgentRunPushPayload,
	signAgentRunPushBody,
} from "@merimoar/agent/runtime/push";
import { describe, expect, it, vi } from "vitest";
import { handleAgentWorkerPushRequest } from "../server/agent/push-handler";

const signingSecret = "push_secret_that_is_at_least_32_characters";
const environment = {
	CONVEX_URL: "https://example.convex.cloud",
	AGENT_RUNTIME_SECRET: "runtime_secret_that_is_at_least_32_characters",
	AGENT_RUN_PUSH_SIGNING_SECRET: signingSecret,
	OPENAI_API_KEY: "openai-test-key",
};

function createLogger() {
	return {
		info: vi.fn<Console["info"]>(),
		warn: vi.fn<Console["warn"]>(),
		error: vi.fn<Console["error"]>(),
	};
}

async function createSignedRequest() {
	const body = serializeAgentRunPushPayload({
		runId: "run-1",
		leaseGeneration: 0,
		deliveryId: "run-1:0:0",
		sentAt: Date.now(),
	});
	return new Request("http://localhost:3001/agent/runs/push", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[AGENT_RUN_PUSH_SIGNATURE_HEADER]: await signAgentRunPushBody(
				body,
				signingSecret,
			),
		},
		body,
	});
}

describe("agent worker push ingress", () => {
	it("accepts a signed exact claim and defers its invocation", async () => {
		const claim: ClaimedRun = {
			runId: "run-1",
			turnId: "turn-1",
			taskId: "task-1",
			anchorCaseId: "case-1",
			agentKey: "agent-v1",
			claimToken: "claim-token",
		};
		const host: AgentRunPushHost = {
			claimRun: vi.fn<AgentRunPushHost["claimRun"]>(async () => claim),
			invokeRun: vi.fn<AgentRunPushHost["invokeRun"]>(async () => {}),
		};
		const deferred: Promise<void>[] = [];
		const logger = createLogger();

		const response = await handleAgentWorkerPushRequest(
			await createSignedRequest(),
			(execution) => deferred.push(execution),
			{
				environment,
				logger,
				createPushHost: () => host,
			},
		);

		expect(response.status).toBe(202);
		expect(deferred).toHaveLength(1);
		await deferred[0];
		expect(host.claimRun).toHaveBeenCalledWith(
			"run-1",
			0,
			expect.any(String),
		);
		expect(host.invokeRun).toHaveBeenCalledWith(claim, expect.any(AbortSignal));
		expect(logger.info).toHaveBeenCalledWith(
			"agent_push_accepted",
			expect.objectContaining({ durationMs: expect.any(Number) }),
		);
	});

	it("rejects an altered delivery before claiming", async () => {
		const host: AgentRunPushHost = {
			claimRun: vi.fn<AgentRunPushHost["claimRun"]>(async () => null),
			invokeRun: vi.fn<AgentRunPushHost["invokeRun"]>(async () => {}),
		};
		const request = await createSignedRequest();
		request.headers.set(AGENT_RUN_PUSH_SIGNATURE_HEADER, `v1=${"0".repeat(64)}`);

		const response = await handleAgentWorkerPushRequest(request, () => {}, {
			environment,
			logger: createLogger(),
			createPushHost: () => host,
		});

		expect(response.status).toBe(401);
		expect(host.claimRun).not.toHaveBeenCalled();
	});

	it("fails closed and logs missing configuration", async () => {
		const logger = createLogger();
		const response = await handleAgentWorkerPushRequest(
			await createSignedRequest(),
			() => {},
			{ environment: {}, logger },
		);

		expect(response.status).toBe(503);
		expect(logger.warn).toHaveBeenCalledWith(
			"agent_worker_unavailable",
			expect.objectContaining({ reason: "missing_configuration" }),
		);
	});
});
