import { isNonRetryableError, type WorkId } from "@convex-dev/workpool";
import { describe, expect, it } from "vitest";
import {
	classifyResendRetrievalError,
	createNonRetryableIngestError,
	isResendAuthorizationError,
	parseNonRetryableIngestError,
} from "#/email/ingestErrors";
import { createTest } from "#/test.setup";
import { internal } from "../_generated/api";

describe("email ingest retry classification", () => {
	it("retries only network-like, rate-limit, and server retrieval failures", () => {
		for (const statusCode of [null, 429, 500, 503]) {
			expect(classifyResendRetrievalError({ statusCode })).toEqual({
				retryable: true,
				failureKind: "provider",
			});
		}
		expect(classifyResendRetrievalError({ statusCode: 401 })).toEqual({
			retryable: false,
			failureKind: "configuration",
		});
		expect(classifyResendRetrievalError({ statusCode: 404 })).toEqual({
			retryable: false,
			failureKind: "unknown",
		});
	});

	it("requires reauthorization only when Resend rejects authorization", () => {
		for (const statusCode of [401, 403]) {
			expect(isResendAuthorizationError({ statusCode })).toBe(true);
		}
		for (const statusCode of [null, 400, 404, 429, 500]) {
			expect(isResendAuthorizationError({ statusCode })).toBe(false);
		}
	});

	it("marks deterministic normalization and storage failures non-retryable", () => {
		for (const message of [
			"Email normalization failed",
			"Email storage failed",
			"Resend returned no email data",
		]) {
			const error = createNonRetryableIngestError("unknown", message);
			expect(isNonRetryableError(error)).toBe(true);
			expect(parseNonRetryableIngestError(error.data.message)).toEqual({
				failureKind: "unknown",
				message,
			});
		}
		expect(isNonRetryableError(new Error("Temporary network failure"))).toBe(
			false,
		);
	});

	it("sanitizes exhausted transient failures and preserves terminal classification", async () => {
		const test = createTest();
		const { eventId, integrationId, workId } = await test.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				referenceSlug: "MER",
				active: true,
			});
			const integrationId = await ctx.db.insert("emailIntegrations", {
				organizationId,
				provider: "resend",
				status: "connected",
				workosOrganizationId: "org_merimoar",
				workosUserId: "user_adam",
				workosDataIntegrationId: "data_integration_resend",
				workosConnectedAccountId: "connected_account_resend",
				workosConnectedAccountUpdatedAt: 1_000,
			});
			const eventId = await ctx.db.insert("emailIngestEvents", {
				integrationId,
				externalEventId: "event-completion",
				externalMessageId: "message-completion",
				eventType: "email.received",
				status: "queued",
				rawPayload: "{}",
				receivedAt: 1_000,
				attempts: 4,
				replayCount: 0,
				processingGeneration: 0,
				workId: "work-id",
			});
			return { eventId, integrationId, workId: "work-id" as WorkId };
		});
		await test.mutation(internal.email.ingestQueue.completeEmailIngestWork, {
			workId,
			context: { eventId, processingGeneration: 0 },
			result: {
				kind: "failed",
				error: "provider body containing secret details",
			},
		});
		expect(await test.run(async (ctx) => ctx.db.get(eventId))).toMatchObject({
			status: "failed",
			failureKind: "provider",
			error: "Resend remained unavailable after retrying",
		});

		const terminalEventId = await test.run(async (ctx) =>
			ctx.db.insert("emailIngestEvents", {
				integrationId,
				externalEventId: "event-terminal-completion",
				externalMessageId: "message-terminal-completion",
				eventType: "email.received",
				status: "queued",
				rawPayload: "{}",
				receivedAt: 2_000,
				attempts: 1,
				replayCount: 0,
				processingGeneration: 0,
				workId: "terminal-work-id",
			}),
		);
		await test.mutation(internal.email.ingestQueue.completeEmailIngestWork, {
			workId: "terminal-work-id" as WorkId,
			context: { eventId: terminalEventId, processingGeneration: 0 },
			result: {
				kind: "failed",
				error: "email-ingest-terminal:unknown:Email normalization failed",
			},
		});
		expect(
			await test.run(async (ctx) => ctx.db.get(terminalEventId)),
		).toMatchObject({
			status: "failed",
			failureKind: "unknown",
			error: "Email normalization failed",
		});
	});
});
