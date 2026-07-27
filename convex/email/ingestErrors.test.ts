import { isNonRetryableError, type WorkId } from "@convex-dev/workpool";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";
import {
	classifyResendRetrievalError,
	createNonRetryableIngestError,
	parseNonRetryableIngestError,
} from "./ingestErrors";

const ISSUER = "https://api.workos.com/";

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

	it("terminates configuration failures without retry and stores a sanitized state", async () => {
		const test = createTest();
		await syncWorkosUser(test, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		});
		const actor = test.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		});
		await test.run(async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				active: true,
			});
			await ctx.db.insert("organizationMembers", {
				organizationId,
				workosUserId: "user_adam",
				active: true,
			});
		});
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const eventId = await test.run(async (ctx) => {
			const eventId = await ctx.db.insert("emailIngestEvents", {
				connectionId,
				externalEventId: "event-no-api-key",
				externalMessageId: "message-no-api-key",
				eventType: "email.received",
				status: "queued",
				rawPayload: '{"secret":"not public"}',
				receivedAt: 1_000,
				attempts: 0,
				replayCount: 0,
				processingGeneration: 0,
			});
			await ctx.db.insert("emailIngestRecipients", {
				eventId,
				address: "inbox@merimoar.test",
				status: "queued",
				receivedAt: 1_000,
			});
			return eventId;
		});

		let thrown: unknown;
		try {
			await test.action(internal.email.resend.processInboundEmail, {
				eventId,
				processingGeneration: 0,
			});
		} catch (error) {
			thrown = error;
		}
		expect(isNonRetryableError(thrown)).toBe(true);
		expect(await test.run(async (ctx) => ctx.db.get(eventId))).toMatchObject({
			status: "failed",
			attempts: 1,
			failureKind: "configuration",
			error: "Email ingest is not configured",
		});
	});

	it("sanitizes exhausted transient failures and preserves terminal classification", async () => {
		const test = createTest();
		const { eventId, workId } = await test.run(async (ctx) => {
			const eventId = await ctx.db.insert("emailIngestEvents", {
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
			return { eventId, workId: "work-id" as WorkId };
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
