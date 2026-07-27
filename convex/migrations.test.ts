import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { createTest, syncWorkosUser } from "./test.setup";

const ISSUER = "https://api.workos.com/";

async function runEmailIngestBackfill(
	test: ReturnType<typeof createTest>,
	reset = false,
) {
	return await test.mutation(
		internal.migrations.backfillEmailIngestReplayState,
		{
			cursor: null,
			dryRun: false,
			oneBatchOnly: true,
			reset,
		},
	);
}

describe("email ingest replay migration", () => {
	it("backfills legacy states and deduplicated normalized recipients", async () => {
		const test = createTest();
		const { failedEventId, ignoredEventId, pendingEventId } = await test.run(
			async (ctx) => {
				const organizationId = await ctx.db.insert("organizations", {
					name: "Merimoar",
					workosOrganizationId: "org_merimoar",
					active: true,
				});
				const connectionId = await ctx.db.insert("emailConnections", {
					organizationId,
					provider: "resend",
					displayName: "Operations",
					address: "connected@merimoar.test",
					status: "active",
				});
				const failedEventId = await ctx.db.insert("emailIngestEvents", {
					externalEventId: "legacy-failed",
					externalMessageId: "message-failed",
					eventType: "email.received",
					status: "failed",
					rawPayload: JSON.stringify({
						data: {
							received_for: [" BCC@Merimoar.Test ", "bcc@merimoar.test"],
							to: ["to@merimoar.test", "BCC@MERIMOAR.TEST"],
						},
					}),
					receivedAt: 1_000,
					error: "No active connection matched the recipient",
					attempts: 0,
				});
				const pendingEventId = await ctx.db.insert("emailIngestEvents", {
					connectionId,
					externalEventId: "legacy-pending",
					externalMessageId: "message-pending",
					eventType: "email.received",
					status: "pending",
					rawPayload: JSON.stringify({
						data: { received_for: ["connected@merimoar.test"], to: [] },
					}),
					receivedAt: 2_000,
					attempts: 1,
				});
				const ignoredEventId = await ctx.db.insert("emailIngestEvents", {
					externalEventId: "legacy-ignored",
					externalMessageId: "message-ignored",
					eventType: "email.delivered",
					status: "ignored",
					rawPayload: "{}",
					receivedAt: 3_000,
					attempts: 0,
				});
				return { failedEventId, ignoredEventId, pendingEventId };
			},
		);

		await runEmailIngestBackfill(test);
		await runEmailIngestBackfill(test, true);

		const state = await test.run(async (ctx) => ({
			failed: await ctx.db.get(failedEventId),
			pending: await ctx.db.get(pendingEventId),
			ignored: await ctx.db.get(ignoredEventId),
			failedRecipients: await ctx.db
				.query("emailIngestRecipients")
				.withIndex("by_event_id_and_address", (index) =>
					index.eq("eventId", failedEventId),
				)
				.collect(),
		}));
		expect(state.failed).toMatchObject({
			status: "unroutable",
			failureKind: "unroutable",
			replayCount: 0,
			processingGeneration: 0,
		});
		expect(state.failedRecipients).toHaveLength(2);
		expect(
			state.failedRecipients.map((recipient) => recipient.address).sort(),
		).toEqual(["bcc@merimoar.test", "to@merimoar.test"]);
		expect(
			state.failedRecipients.every(
				(recipient) => recipient.status === "unroutable",
			),
		).toBe(true);
		expect(state.pending).toMatchObject({
			status: "failed",
			failureKind: "unknown",
			replayCount: 0,
			processingGeneration: 0,
		});
		expect(state.ignored).toMatchObject({
			status: "processed",
			processedAt: 3_000,
			replayCount: 0,
			processingGeneration: 0,
		});

		const verification = await test.query(
			internal.migrations.verifyEmailIngestReplayState,
			{ paginationOpts: { cursor: null, numItems: 10 } },
		);
		expect(verification.page).toHaveLength(3);
		expect(verification.page.every((event) => event.complete)).toBe(true);
	});

	it("makes a legacy unroutable failure visible and replayable only via its matching connection", async () => {
		const test = createTest();
		await syncWorkosUser(test, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		});
		const eventId = await test.run(async (ctx) => {
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
			return await ctx.db.insert("emailIngestEvents", {
				externalEventId: "legacy-visible-failure",
				externalMessageId: "legacy-message",
				eventType: "email.received",
				status: "failed",
				rawPayload: JSON.stringify({
					data: {
						received_for: ["legacy@merimoar.test"],
						to: Array.from(
							{ length: 110 },
							(_, index) => `recipient-${index}@example.test`,
						),
					},
				}),
				receivedAt: 1_000,
				attempts: 0,
			});
		});
		await runEmailIngestBackfill(test);
		const actor = test.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		});
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Legacy inbox",
			address: "legacy@merimoar.test",
		});

		expect(
			await actor.query(api.email.ingestOperations.listFailedEvents, {
				connectionId,
			}),
		).toEqual([
			expect.objectContaining({
				eventId,
				status: "unroutable",
			}),
		]);
		expect(
			await actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				connectionId,
				eventId,
			}),
		).toEqual({ status: "queued" });
		expect(await test.run(async (ctx) => ctx.db.get(eventId))).toMatchObject({
			connectionId,
			status: "queued",
			replayCount: 1,
			processingGeneration: 1,
		});
	});
});
