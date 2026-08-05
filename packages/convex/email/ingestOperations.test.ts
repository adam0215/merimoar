import type { WorkId } from "@convex-dev/workpool";
import { describe, expect, it } from "vitest";
import {
	createActiveEmailInbox,
	createConnectedResendIntegration,
	createTest,
	syncWorkosUser,
} from "#/test.setup";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

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
	const { organizationId, otherOrganizationId } = await base.run(
		async (ctx) => {
			const organizationId = await ctx.db.insert("organizations", {
				name: "Merimoar",
				workosOrganizationId: "org_merimoar",
				referenceSlug: "MER",
				active: true,
			});
			const otherOrganizationId = await ctx.db.insert("organizations", {
				name: "Other",
				workosOrganizationId: "org_other",
				referenceSlug: "OTHR",
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
			return { organizationId, otherOrganizationId };
		},
	);

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
		organizationId,
		otherOrganizationId,
	};
}

async function routeEvent(
	base: Awaited<ReturnType<typeof createFixture>>["base"],
	integrationId: Id<"emailIntegrations">,
	overrides: {
		externalEventId?: string;
		receivedForAddresses?: string[];
		toAddresses?: string[];
	} = {},
) {
	return await base.mutation(internal.email.ingest.routeResendEvent, {
		integrationId,
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
	it("lists and replays only through the exact owned inbox", async () => {
		const { actor, base, organizationId, otherActor, otherOrganizationId } =
			await createFixture();
		const inboxId = await createActiveEmailInbox(actor, {
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const otherInboxId = await createActiveEmailInbox(otherActor, {
			displayName: "Other",
			address: "other@example.test",
		});
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);
		await createConnectedResendIntegration(base, otherOrganizationId, "other");
		const receipt = await routeEvent(base, integrationId);
		const eventId = receipt.eventId;
		if (!eventId) {
			throw new Error("Expected a routed event");
		}
		await base.mutation(internal.email.ingest.recordTerminalProcessingFailure, {
			eventId,
			error: "Provider rejected the request",
			failureKind: "provider",
			processingGeneration: 0,
		});

		const failures = await actor.query(
			api.email.ingestOperations.listFailedEvents,
			{ inboxId },
		);
		expect(failures).toEqual([
			expect.objectContaining({
				eventId,
				inboxId,
				status: "failed",
				replayCount: 0,
				reason: "Resend could not load this email.",
			}),
		]);
		expect(failures[0]).not.toHaveProperty("rawPayload");
		expect(failures[0]).not.toHaveProperty("externalEventId");
		await expect(
			base.query(api.email.ingestOperations.listFailedEvents, { inboxId }),
		).rejects.toThrow("Sign in");
		expect(
			await actor.query(api.email.ingestOperations.listFailedEvents, {
				inboxId: otherInboxId,
			}),
		).toEqual([]);
		await expect(
			otherActor.mutation(api.email.ingestOperations.replayFailedEvent, {
				inboxId,
				eventId,
			}),
		).rejects.toThrow("could not be found");

		expect(
			await actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				inboxId,
				eventId,
			}),
		).toEqual({ status: "queued" });
		expect(
			await actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				inboxId,
				eventId,
			}),
		).toEqual({ status: "already_queued" });
	});

	it("routes an authoritative received_for recipient through the organization router", async () => {
		const { actor, base, organizationId } = await createFixture();
		const inboxId = await createActiveEmailInbox(actor, {
			displayName: "BCC inbox",
			address: "bcc@merimoar.test",
		});
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);
		const receipt = await routeEvent(base, integrationId, {
			externalEventId: "event-bcc",
			receivedForAddresses: [" BCC@Merimoar.Test "],
			toAddresses: Array.from(
				{ length: 125 },
				(_, index) => `recipient-${index}@example.test`,
			),
		});
		const eventId = receipt.eventId;
		if (!eventId) {
			throw new Error("Expected a routed event");
		}
		expect(receipt.status).toBe("accepted");

		const state = await base.run(async (ctx) => ({
			event: await ctx.db.get(eventId),
			recipients: await ctx.db
				.query("emailIngestRecipients")
				.withIndex("by_event_id_and_address", (index) =>
					index.eq("eventId", eventId),
				)
				.collect(),
		}));
		expect(state.event).toMatchObject({ inboxId, integrationId });
		expect(state.recipients).toHaveLength(100);
		expect(state.recipients.map((recipient) => recipient.address)).toContain(
			"bcc@merimoar.test",
		);
	});

	it("does not route an integration into another organization", async () => {
		const { base, organizationId, otherActor } = await createFixture();
		const otherInboxId = await createActiveEmailInbox(otherActor, {
			displayName: "Other",
			address: "shared@example.test",
		});
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);
		const receipt = await routeEvent(base, integrationId, {
			externalEventId: "event-cross-organization",
			toAddresses: ["shared@example.test"],
		});

		expect(receipt.status).toBe("unroutable");
		const eventId = receipt.eventId;
		if (!eventId) {
			throw new Error("Expected an unroutable event");
		}
		const event = await base.run(async (ctx) => ctx.db.get(eventId));
		expect(event).toMatchObject({ integrationId });
		expect(event).not.toHaveProperty("inboxId");
		expect(
			await otherActor.query(api.email.ingestOperations.listFailedEvents, {
				inboxId: otherInboxId,
			}),
		).toEqual([]);
		await expect(
			otherActor.mutation(api.email.ingestOperations.replayFailedEvent, {
				inboxId: otherInboxId,
				eventId,
			}),
		).rejects.toThrow("could not be found");
	});

	it("tracks attempts and ignores stale Workpool generations", async () => {
		const { actor, base, organizationId } = await createFixture();
		const inboxId = await createActiveEmailInbox(actor, {
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);
		const receipt = await routeEvent(base, integrationId, {
			externalEventId: "event-state-machine",
			toAddresses: ["inbox@merimoar.test"],
		});
		const eventId = receipt.eventId;
		if (!eventId) {
			throw new Error("Expected a routed event");
		}
		const initialEvent = await base.run(async (ctx) => ctx.db.get(eventId));
		if (!initialEvent?.workId) {
			throw new Error("Expected Workpool work");
		}
		const initialWorkId = initialEvent.workId as WorkId;

		expect(
			(
				await base.mutation(internal.email.ingest.prepareProcessingAttempt, {
					eventId,
					processingGeneration: 0,
				})
			)?.inbox._id,
		).toBe(inboxId);
		await base.mutation(internal.email.ingestQueue.completeEmailIngestWork, {
			workId: initialWorkId,
			context: { eventId, processingGeneration: 0 },
			result: { kind: "failed", error: "Provider unavailable" },
		});
		await actor.mutation(api.email.ingestOperations.replayFailedEvent, {
			inboxId,
			eventId,
		});
		await base.mutation(internal.email.ingestQueue.completeEmailIngestWork, {
			workId: initialWorkId,
			context: { eventId, processingGeneration: 0 },
			result: { kind: "failed", error: "Stale completion" },
		});

		expect(await base.run(async (ctx) => ctx.db.get(eventId))).toMatchObject({
			status: "queued",
			attempts: 1,
			replayCount: 1,
			processingGeneration: 1,
		});
	});

	it("shows but does not replay a failure through a disabled inbox", async () => {
		const { actor, base, organizationId } = await createFixture();
		const inboxId = await createActiveEmailInbox(actor, {
			displayName: "Operations",
			address: "inbox@merimoar.test",
		});
		const integrationId = await createConnectedResendIntegration(
			base,
			organizationId,
		);
		const receipt = await routeEvent(base, integrationId, {
			externalEventId: "event-disabled",
			toAddresses: ["inbox@merimoar.test"],
		});
		const eventId = receipt.eventId;
		if (!eventId) {
			throw new Error("Expected a routed event");
		}
		await base.mutation(internal.email.ingest.recordTerminalProcessingFailure, {
			eventId,
			error: "Permanent provider failure",
			failureKind: "provider",
			processingGeneration: 0,
		});
		await actor.mutation(api.email.inboxes.remove, { inboxId });

		expect(
			await actor.query(api.email.ingestOperations.listFailedEvents, {
				inboxId,
			}),
		).toEqual([
			expect.objectContaining({
				eventId,
				canReplay: false,
			}),
		]);
		await expect(
			actor.mutation(api.email.ingestOperations.replayFailedEvent, {
				inboxId,
				eventId,
			}),
		).rejects.toThrow("inbox and integration");
	});
});
