import type { WorkId } from "@convex-dev/workpool";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { createTest, syncWorkosUser } from "../test.setup";

const ISSUER = "https://api.workos.com/";

async function createFixture() {
	const base = createTest();
	await Promise.all([
		syncWorkosUser(base, {
			id: "user_adam",
			name: "Adam",
			email: "adam@merimoar.com",
		}),
		syncWorkosUser(base, {
			id: "user_other",
			name: "Other",
			email: "other@example.com",
		}),
	]);
	await base.run(async (ctx) => {
		const organizationId = await ctx.db.insert("organizations", {
			name: "Merimoar",
			workosOrganizationId: "org_merimoar",
			active: true,
		});
		const otherOrganizationId = await ctx.db.insert("organizations", {
			name: "Other",
			workosOrganizationId: "org_other",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			workosUserId: "user_adam",
			active: true,
		});
		await ctx.db.insert("organizationMembers", {
			organizationId: otherOrganizationId,
			workosUserId: "user_other",
			active: true,
		});
	});

	return {
		base,
		actor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_adam",
			org_id: "org_merimoar",
		}),
		otherActor: base.withIdentity({
			issuer: ISSUER,
			subject: "user_other",
			org_id: "org_other",
		}),
	};
}

async function recordEvent(
	base: Awaited<ReturnType<typeof createFixture>>["base"],
	overrides: {
		externalEventId?: string;
		receivedForAddresses?: string[];
		toAddresses?: string[];
	} = {},
) {
	return await base.mutation(internal.email.ingest.recordResendEvent, {
		externalEventId: overrides.externalEventId ?? "event-1",
		externalMessageId: "message-1",
		eventType: "email.received",
		receivedForAddresses: overrides.receivedForAddresses ?? [],
		toAddresses: overrides.toAddresses ?? [
			" Inbox@Merimoar.Test ",
			"inbox@merimoar.test",
		],
		rawPayload: '{"secret":"must stay internal"}',
		receivedAt: 1_000,
	});
}

describe("failed email ingest operations", () => {
	it("lists and replays only through the exact owned matching connection", async () => {
		const { actor, base, otherActor } = await createFixture();
		const receipt = await recordEvent(base);
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const wrongConnectionId = await actor.mutation(
			api.email.connections.create,
			{
				provider: "resend",
				displayName: "Wrong inbox",
				address: "wrong@merimoar.test",
			},
		);
		const otherConnectionId = await otherActor.mutation(
			api.email.connections.create,
			{
				provider: "resend",
				displayName: "Other",
				address: "other@example.test",
			},
		);

		const failures = await actor.query(
			api.email.ingestOperations.listFailedEvents,
			{ connectionId },
		);
		expect(failures).toEqual([
			expect.objectContaining({
				eventId: receipt.eventId,
				connectionId,
				status: "unroutable",
				replayCount: 0,
				reason: "No connection matched this recipient.",
			}),
		]);
		expect(failures[0]).not.toHaveProperty("rawPayload");
		expect(failures[0]).not.toHaveProperty("externalEventId");
		expect(failures[0]).not.toHaveProperty("externalMessageId");
		expect(failures[0]).not.toHaveProperty("error");
		expect(
			await actor.query(api.email.ingestOperations.listFailedEvents, {
				connectionId: wrongConnectionId,
			}),
		).toEqual([]);
		await expect(
			base.query(api.email.ingestOperations.listFailedEvents, {
				connectionId,
			}),
		).rejects.toThrow("Sign in");
		await expect(
			actor.query(api.email.ingestOperations.listFailedEvents, {
				connectionId: otherConnectionId,
			}),
		).rejects.toThrow("could not be found");
		await expect(
			otherActor.mutation(api.email.ingestOperations.replayFailedEvent, {
				connectionId,
				eventId: receipt.eventId,
			}),
		).rejects.toThrow("could not be found");
		await expect(
			actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				connectionId: wrongConnectionId,
				eventId: receipt.eventId,
			}),
		).rejects.toThrow("could not be found");

		expect(
			await actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				connectionId,
				eventId: receipt.eventId,
			}),
		).toEqual({ status: "queued" });
		expect(
			await actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				connectionId,
				eventId: receipt.eventId,
			}),
		).toEqual({ status: "already_queued" });
		expect(
			await base.run(async (ctx) => ctx.db.get(receipt.eventId)),
		).toMatchObject({
			connectionId,
			status: "queued",
			replayCount: 1,
			processingGeneration: 1,
		});
	});

	it("rejects an address row that conflicts with the event connection", async () => {
		const { actor, base } = await createFixture();
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const wrongConnectionId = await actor.mutation(
			api.email.connections.create,
			{
				provider: "resend",
				displayName: "Wrong inbox",
				address: "wrong@merimoar.test",
			},
		);
		const receipt = await recordEvent(base, {
			externalEventId: "event-conflicting-route",
			toAddresses: ["inbox@merimoar.test"],
		});
		await base.run(async (ctx) => {
			await ctx.db.patch(receipt.eventId, {
				status: "failed",
				failureKind: "unknown",
			});
			await ctx.db.insert("emailIngestRecipients", {
				eventId: receipt.eventId,
				address: "wrong@merimoar.test",
				status: "failed",
				receivedAt: 1_000,
			});
		});

		expect(
			await actor.query(api.email.ingestOperations.listFailedEvents, {
				connectionId: wrongConnectionId,
			}),
		).toEqual([]);
		await expect(
			actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				connectionId: wrongConnectionId,
				eventId: receipt.eventId,
			}),
		).rejects.toThrow("could not be found");
		expect(
			await actor.query(api.email.ingestOperations.listFailedEvents, {
				connectionId,
			}),
		).toHaveLength(0);
	});

	it("routes an authoritative received_for BCC recipient before the to cap", async () => {
		const { actor, base } = await createFixture();
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "BCC inbox",
			address: "bcc@merimoar.test",
		});
		const receipt = await recordEvent(base, {
			externalEventId: "event-bcc",
			receivedForAddresses: [" BCC@Merimoar.Test "],
			toAddresses: Array.from(
				{ length: 125 },
				(_, index) => `recipient-${index}@example.test`,
			),
		});
		expect(receipt.status).toBe("accepted");

		const state = await base.run(async (ctx) => ({
			event: await ctx.db.get(receipt.eventId),
			recipients: await ctx.db
				.query("emailIngestRecipients")
				.withIndex("by_event_id_and_address", (index) =>
					index.eq("eventId", receipt.eventId),
				)
				.collect(),
		}));
		expect(state.event?.connectionId).toBe(connectionId);
		expect(state.recipients).toHaveLength(100);
		expect(state.recipients.map((recipient) => recipient.address)).toContain(
			"bcc@merimoar.test",
		);
	});

	it("tracks attempts and ignores stale Workpool generations", async () => {
		const { actor, base } = await createFixture();
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const receipt = await recordEvent(base, {
			externalEventId: "event-state-machine",
			toAddresses: ["inbox@merimoar.test"],
		});
		const initialEvent = await base.run(async (ctx) =>
			ctx.db.get(receipt.eventId),
		);
		if (!initialEvent?.workId) {
			throw new Error("Expected Workpool work");
		}
		const initialWorkId = initialEvent.workId as WorkId;

		expect(
			(
				await base.mutation(internal.email.ingest.prepareProcessingAttempt, {
					eventId: receipt.eventId,
					processingGeneration: 0,
				})
			)?.connection._id,
		).toBe(connectionId);
		await base.mutation(internal.email.ingestQueue.completeEmailIngestWork, {
			workId: initialWorkId,
			context: { eventId: receipt.eventId, processingGeneration: 0 },
			result: { kind: "failed", error: "Provider unavailable" },
		});
		await actor.mutation(api.email.ingestOperations.replayFailedEvent, {
			connectionId,
			eventId: receipt.eventId,
		});
		await base.mutation(internal.email.ingestQueue.completeEmailIngestWork, {
			workId: initialWorkId,
			context: { eventId: receipt.eventId, processingGeneration: 0 },
			result: { kind: "failed", error: "Stale completion" },
		});

		expect(
			await base.run(async (ctx) => ctx.db.get(receipt.eventId)),
		).toMatchObject({
			status: "queued",
			attempts: 1,
			replayCount: 1,
			processingGeneration: 1,
		});
	});

	it("shows but does not replay a failure through a disabled connection", async () => {
		const { actor, base } = await createFixture();
		const connectionId = await actor.mutation(api.email.connections.create, {
			provider: "resend",
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const receipt = await recordEvent(base, {
			externalEventId: "event-disabled",
			toAddresses: ["inbox@merimoar.test"],
		});
		await base.mutation(internal.email.ingest.recordTerminalProcessingFailure, {
			eventId: receipt.eventId,
			error: "Permanent provider failure",
			failureKind: "provider",
			processingGeneration: 0,
		});
		await actor.mutation(api.email.connections.remove, { connectionId });

		expect(
			await actor.query(api.email.ingestOperations.listFailedEvents, {
				connectionId,
			}),
		).toEqual([
			expect.objectContaining({
				eventId: receipt.eventId,
				canReplay: false,
			}),
		]);
		await expect(
			actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				connectionId,
				eventId: receipt.eventId,
			}),
		).rejects.toThrow("Reactivate");
	});
});
