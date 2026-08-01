import { v } from "convex/values";
import { upsertSenderContact } from "#/contact/model";
import { normalizeEntityIdentifier } from "#/entity/constants";
import { syncGlobalSearchEntry } from "#/globalSearch/model";
import {
	ACME_AGENT_DEMO_ENTITIES,
	ACME_CASES,
	ACME_INBOX,
	ACME_SUGGESTION_EMAILS,
	type AcmeCaseSeed,
	type AcmeSuggestionEmailSeed,
} from "#/seed/acmeData";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const AGENT_DEMO_ENTITY_TYPE_KEY = "demo-anlaggning";
const AGENT_DEMO_FIELDS = [
	{ label: "Adress", position: 0, seedKey: "address" },
	{ label: "Kund", position: 1, seedKey: "customer" },
	{
		label: "Driftinformation",
		position: 2,
		seedKey: "operationalContext",
	},
] as const;

function formatSeedMessageSubject(subject: string, messageIndex: number) {
	return messageIndex === 0 || subject.startsWith("Re:")
		? subject
		: `Re: ${subject}`;
}

async function requireOrganization(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const organization = await ctx.db.get(organizationId);
	if (!organization || !organization.active) {
		throw new Error("Choose an active organization for the seed data");
	}
	return organization;
}

async function requireSeedOwner(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const member = await ctx.db
		.query("organizationMembers")
		.withIndex("by_organization_id_and_active", (index) =>
			index.eq("organizationId", organizationId).eq("active", true),
		)
		.first();
	if (!member) {
		throw new Error("The seed data requires an active organization member");
	}
	return member;
}

export async function getOrCreateSeedEmailIntegration(
	ctx: MutationCtx,
	organization: Doc<"organizations">,
	owner: Doc<"organizationMembers">,
) {
	const existing = await ctx.db
		.query("emailIntegrations")
		.withIndex("by_organization_id_and_provider", (index) =>
			index.eq("organizationId", organization._id).eq("provider", "resend"),
		)
		.first();
	if (existing) {
		return existing;
	}

	const integrationId = await ctx.db.insert("emailIntegrations", {
		organizationId: organization._id,
		provider: "resend",
		status: "disconnected",
		workosUserId: owner.workosUserId,
		workosOrganizationId: organization.workosOrganizationId,
		workosDataIntegrationId: "seed-acme-ab",
		workosConnectedAccountId: `seed-acme-ab-${organization._id}`,
		workosConnectedAccountUpdatedAt: Date.now(),
	});
	const integration = await ctx.db.get(integrationId);
	if (!integration) {
		throw new Error("Could not create the seed email integration");
	}
	return integration;
}

async function getOrCreateSeedInbox(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const existing = await ctx.db
		.query("emailInboxes")
		.withIndex("by_organization_id_and_address", (index) =>
			index
				.eq("organizationId", organizationId)
				.eq("address", ACME_INBOX.address),
		)
		.unique();
	if (existing) {
		await ctx.db.patch(existing._id, {
			displayName: ACME_INBOX.displayName,
			status: "active",
			outbound: undefined,
		});
		return existing._id;
	}

	return await ctx.db.insert("emailInboxes", {
		organizationId,
		...ACME_INBOX,
		status: "active",
		unreadThreadCount: 0,
	});
}

async function getOrCreateAgentDemoEntityType(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const existing = await ctx.db
		.query("entityTypes")
		.withIndex("by_organization_id_and_key", (index) =>
			index
				.eq("organizationId", organizationId)
				.eq("key", AGENT_DEMO_ENTITY_TYPE_KEY),
		)
		.unique();
	if (existing) {
		await ctx.db.patch(existing._id, {
			name: "Demoanläggning",
			pluralName: "Demoanläggningar",
			identifierLabel: "Anläggningsnummer",
			description: "Anläggningsdata för agentens manuella demoscenario.",
			icon: "building",
			archivedAt: null,
		});
		return existing._id;
	}

	return await ctx.db.insert("entityTypes", {
		organizationId,
		key: AGENT_DEMO_ENTITY_TYPE_KEY,
		name: "Demoanläggning",
		pluralName: "Demoanläggningar",
		identifierLabel: "Anläggningsnummer",
		description: "Anläggningsdata för agentens manuella demoscenario.",
		icon: "building",
		archivedAt: null,
	});
}

async function getOrCreateAgentDemoFields(
	ctx: MutationCtx,
	entityTypeId: Id<"entityTypes">,
) {
	const existingFields = await ctx.db
		.query("entityFieldDefinitions")
		.withIndex("by_entity_type_id_and_position", (index) =>
			index.eq("entityTypeId", entityTypeId),
		)
		.take(AGENT_DEMO_FIELDS.length);
	const fields: Array<{
		id: Id<"entityFieldDefinitions">;
		seedKey: (typeof AGENT_DEMO_FIELDS)[number]["seedKey"];
	}> = [];

	for (const expected of AGENT_DEMO_FIELDS) {
		const existing = existingFields.find(
			(field) => field.position === expected.position,
		);
		if (existing) {
			if (existing.valueType !== "text") {
				throw new Error(
					`Demo field ${expected.label} has an incompatible value type`,
				);
			}
			await ctx.db.patch(existing._id, {
				label: expected.label,
				required: true,
				archivedAt: null,
			});
			fields.push({ id: existing._id, seedKey: expected.seedKey });
			continue;
		}
		fields.push({
			id: await ctx.db.insert("entityFieldDefinitions", {
				entityTypeId,
				label: expected.label,
				valueType: "text",
				required: true,
				position: expected.position,
				archivedAt: null,
			}),
			seedKey: expected.seedKey,
		});
	}

	return fields;
}

async function upsertAgentDemoTextValue(
	ctx: MutationCtx,
	entityId: Id<"entities">,
	fieldDefinitionId: Id<"entityFieldDefinitions">,
	value: string,
) {
	const existing = await ctx.db
		.query("entityTextFieldValues")
		.withIndex("by_entity_id_and_field_definition_id", (index) =>
			index.eq("entityId", entityId).eq("fieldDefinitionId", fieldDefinitionId),
		)
		.unique();
	if (existing) {
		await ctx.db.patch(existing._id, { value });
		return;
	}
	await ctx.db.insert("entityTextFieldValues", {
		entityId,
		fieldDefinitionId,
		value,
	});
}

async function upsertAgentDemoEntity(
	ctx: MutationCtx,
	args: {
		organizationId: Id<"organizations">;
		entityTypeId: Id<"entityTypes">;
		fields: Array<{
			id: Id<"entityFieldDefinitions">;
			seedKey: (typeof AGENT_DEMO_FIELDS)[number]["seedKey"];
		}>;
		seed: (typeof ACME_AGENT_DEMO_ENTITIES)[number];
		now: number;
	},
) {
	const normalizedIdentifier = normalizeEntityIdentifier(args.seed.identifier);
	const existing = await ctx.db
		.query("entities")
		.withIndex("by_entity_type_id_and_normalized_identifier", (index) =>
			index
				.eq("entityTypeId", args.entityTypeId)
				.eq("normalizedIdentifier", normalizedIdentifier),
		)
		.unique();
	const entityId =
		existing?._id ??
		(await ctx.db.insert("entities", {
			entityTypeId: args.entityTypeId,
			identifier: args.seed.identifier,
			normalizedIdentifier,
			displayName: args.seed.displayName,
			createdAt: args.now,
			updatedAt: args.now,
			archivedAt: null,
		}));
	if (existing) {
		await ctx.db.patch(existing._id, {
			identifier: args.seed.identifier,
			displayName: args.seed.displayName,
			updatedAt: args.now,
			archivedAt: null,
		});
	}

	for (const field of args.fields) {
		await upsertAgentDemoTextValue(
			ctx,
			entityId,
			field.id,
			args.seed[field.seedKey],
		);
	}

	const globalSearchEntryId = await syncGlobalSearchEntry(
		ctx,
		existing?.globalSearchEntryId,
		{
			organizationId: args.organizationId,
			target: {
				kind: "entity",
				entityId,
				entityTypeId: args.entityTypeId,
			},
			identifier: args.seed.identifier,
			label: args.seed.displayName,
			descriptor: "Demoanläggning",
		},
	);
	if (globalSearchEntryId !== existing?.globalSearchEntryId) {
		await ctx.db.patch(entityId, { globalSearchEntryId });
	}
	return existing === null ? "created" : "existing";
}

async function findSeedCase(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	reference: string,
) {
	return await ctx.db
		.query("cases")
		.withIndex("by_organization_id_and_reference", (index) =>
			index.eq("organizationId", organizationId).eq("reference", reference),
		)
		.unique();
}

async function insertSeedCase(
	ctx: MutationCtx,
	args: {
		organizationId: Id<"organizations">;
		owner: Doc<"organizationMembers">;
		inboxId: Id<"emailInboxes">;
		integrationId: Id<"emailIntegrations">;
		seed: AcmeCaseSeed;
		now: number;
	},
) {
	const { organizationId, owner, inboxId, integrationId, seed, now } = args;
	const startedAt = now - seed.daysAgo * DAY_MS;
	const lastMessageAt =
		startedAt +
		Math.max(...seed.messages.map((message) => message.hoursAfterStart)) *
			HOUR_MS;
	const contactId = await upsertSenderContact(
		ctx,
		organizationId,
		seed.contact,
		lastMessageAt,
	);

	const caseId = await ctx.db.insert("cases", {
		organizationId,
		reference: seed.reference,
		title: seed.title,
		description: seed.description,
		ownerMemberId: owner._id,
		dueAt: seed.dueInDays === null ? null : now + seed.dueInDays * DAY_MS,
		status: seed.status,
		lastActivityAt: lastMessageAt,
		createdAt: startedAt,
		updatedAt: lastMessageAt,
	});
	const globalSearchEntryId = await syncGlobalSearchEntry(ctx, undefined, {
		organizationId,
		target: { kind: "case", caseId },
		identifier: seed.reference,
		label: seed.title,
		descriptor: "Case",
	});
	await ctx.db.patch(caseId, { globalSearchEntryId });
	await ctx.scheduler.runAfter(0, internal.case.embedding.embedCase, {
		caseId,
	});

	const threadId = await ctx.db.insert("emailThreads", {
		organizationId,
		inboxId,
		lastActivityAt: lastMessageAt,
		isUnread: seed.unread,
	});
	await ctx.db.insert("emailThreadExternalReferences", {
		threadId,
		inboxId,
		integrationId,
		externalThreadId: `seed-thread-${seed.reference.toLowerCase()}`,
	});
	await ctx.db.insert("caseContactRelations", {
		caseId,
		contactId,
		startedAt,
		endedAt: null,
		addedByMemberId: owner._id,
		removedByMemberId: null,
	});
	await ctx.db.insert("caseEmailThreadRelations", {
		caseId,
		threadId,
		startedAt,
		endedAt: null,
		linkedByMemberId: owner._id,
		unlinkedByMemberId: null,
	});
	await ctx.db.insert("caseEvents", {
		caseId,
		type: "human_note",
		body: seed.initialNote,
		occurredAt: startedAt,
		createdAt: startedAt,
		createdByMemberId: owner._id,
	});

	const internetMessageIds: string[] = [];
	let latestMessageId: Id<"emailMessages"> | undefined;
	for (const [messageIndex, message] of seed.messages.entries()) {
		const sentAt = startedAt + message.hoursAfterStart * HOUR_MS;
		const internetMessageId = `<${seed.reference.toLowerCase()}-${messageIndex + 1}@seed.acme.invalid>`;
		const previousMessageId = internetMessageIds.at(-1);
		const commonMessageFields = {
			inboxId,
			integrationId,
			threadId,
			internetMessageId,
			inReplyTo: previousMessageId,
			references: [...internetMessageIds],
			subject: formatSeedMessageSubject(seed.subject, messageIndex),
			textBody: message.body,
			sentAt,
			cc: [],
			bcc: [],
			replyTo: [],
		};

		if (message.direction === "inbound") {
			latestMessageId = await ctx.db.insert("emailMessages", {
				...commonMessageFields,
				direction: "inbound",
				senderContactId: contactId,
				externalMessageId: `seed-inbound-${seed.reference.toLowerCase()}-${messageIndex + 1}`,
				from: seed.contact,
				to: [{ address: ACME_INBOX.address }],
				receivedAt: sentAt,
			});
		} else {
			latestMessageId = await ctx.db.insert("emailMessages", {
				...commonMessageFields,
				direction: "outbound",
				authoredByMemberId: owner._id,
				externalMessageId: `seed-outbound-${seed.reference.toLowerCase()}-${messageIndex + 1}`,
				from: {
					name: ACME_INBOX.displayName,
					address: ACME_INBOX.address,
				},
				to: [seed.contact],
			});
			await ctx.db.insert("emailSends", {
				messageId: latestMessageId,
				requestedByMemberId: owner._id,
				clientRequestId: `seed-${seed.reference.toLowerCase()}-${messageIndex + 1}`,
				status: "sent",
				generation: 0,
				attemptCount: 1,
				lastAttemptAt: sentAt,
				acceptedAt: sentAt,
			});
		}

		await ctx.db.insert("caseEvents", {
			caseId,
			type:
				message.direction === "inbound" ? "inbound_email" : "outbound_email",
			emailMessageId: latestMessageId,
			occurredAt: sentAt,
			createdAt: sentAt,
			createdByMemberId: message.direction === "inbound" ? null : owner._id,
		});
		internetMessageIds.push(internetMessageId);
	}

	if (!latestMessageId) {
		throw new Error(`Seed case ${seed.reference} has no email messages`);
	}
	await ctx.db.patch(threadId, { latestMessageId });
	return threadId;
}

async function countUnreadThreads(
	ctx: MutationCtx,
	inboxId: Id<"emailInboxes">,
) {
	const unreadThreads = await ctx.db
		.query("emailThreads")
		.withIndex("by_inbox_id_and_is_unread", (index) =>
			index.eq("inboxId", inboxId).eq("isUnread", true),
		)
		.collect();
	return unreadThreads.length;
}

async function insertSuggestionEmailThread(
	ctx: MutationCtx,
	args: {
		organizationId: Id<"organizations">;
		inboxId: Id<"emailInboxes">;
		integrationId: Id<"emailIntegrations">;
		seed: AcmeSuggestionEmailSeed;
		now: number;
	},
) {
	const { organizationId, inboxId, integrationId, seed, now } = args;
	const startedAt = now - seed.daysAgo * DAY_MS;
	const lastMessageAt =
		startedAt +
		Math.max(...seed.messages.map((message) => message.hoursAfterStart)) *
			HOUR_MS;
	const contactId = await upsertSenderContact(
		ctx,
		organizationId,
		seed.contact,
		lastMessageAt,
	);
	const threadId = await ctx.db.insert("emailThreads", {
		organizationId,
		inboxId,
		lastActivityAt: lastMessageAt,
		isUnread: true,
	});
	await ctx.db.insert("emailThreadExternalReferences", {
		threadId,
		inboxId,
		integrationId,
		externalThreadId: `seed-suggestion-${seed.key}`,
	});

	const internetMessageIds: string[] = [];
	let latestMessageId: Id<"emailMessages"> | undefined;
	for (const [messageIndex, message] of seed.messages.entries()) {
		const sentAt = startedAt + message.hoursAfterStart * HOUR_MS;
		const internetMessageId = `<suggestion-${seed.key}-${messageIndex + 1}@seed.acme.invalid>`;
		latestMessageId = await ctx.db.insert("emailMessages", {
			inboxId,
			integrationId,
			threadId,
			senderContactId: contactId,
			externalMessageId: `seed-suggestion-${seed.key}-${messageIndex + 1}`,
			internetMessageId,
			inReplyTo: internetMessageIds.at(-1),
			references: [...internetMessageIds],
			direction: "inbound",
			from: seed.contact,
			to: [{ address: ACME_INBOX.address }],
			cc: [],
			bcc: [],
			replyTo: [],
			subject: formatSeedMessageSubject(seed.subject, messageIndex),
			textBody: message.body,
			sentAt,
			receivedAt: sentAt,
		});
		internetMessageIds.push(internetMessageId);
	}

	if (!latestMessageId) {
		throw new Error(`Suggestion seed ${seed.key} has no email messages`);
	}
	await ctx.db.patch(threadId, { latestMessageId });
}

export const seed = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		confirmation: v.literal("seed-acme-ab"),
	},
	returns: v.object({
		createdCases: v.number(),
		existingCases: v.number(),
		createdThreads: v.number(),
		inboxId: v.id("emailInboxes"),
	}),
	handler: async (ctx, args) => {
		const organization = await requireOrganization(ctx, args.organizationId);
		const owner = await requireSeedOwner(ctx, organization._id);
		const integration = await getOrCreateSeedEmailIntegration(
			ctx,
			organization,
			owner,
		);
		const inboxId = await getOrCreateSeedInbox(ctx, organization._id);
		const now = Date.now();
		let createdCases = 0;
		let existingCases = 0;

		for (const seedCase of ACME_CASES) {
			const existing = await findSeedCase(
				ctx,
				organization._id,
				seedCase.reference,
			);
			if (existing) {
				existingCases += 1;
				continue;
			}
			await insertSeedCase(ctx, {
				organizationId: organization._id,
				owner,
				inboxId,
				integrationId: integration._id,
				seed: seedCase,
				now,
			});
			createdCases += 1;
		}

		await ctx.db.patch(inboxId, {
			unreadThreadCount: await countUnreadThreads(ctx, inboxId),
		});
		return {
			createdCases,
			existingCases,
			createdThreads: createdCases,
			inboxId,
		};
	},
});

export const seedSuggestionEmails = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		confirmation: v.literal("seed-suggestion-emails"),
	},
	returns: v.object({
		createdThreads: v.number(),
		existingThreads: v.number(),
		inboxId: v.id("emailInboxes"),
	}),
	handler: async (ctx, args) => {
		const organization = await requireOrganization(ctx, args.organizationId);
		const owner = await requireSeedOwner(ctx, organization._id);
		const integration = await getOrCreateSeedEmailIntegration(
			ctx,
			organization,
			owner,
		);
		const inboxId = await getOrCreateSeedInbox(ctx, organization._id);
		const now = Date.now();
		let createdThreads = 0;
		let existingThreads = 0;

		for (const suggestionEmail of ACME_SUGGESTION_EMAILS) {
			const existingReference = await ctx.db
				.query("emailThreadExternalReferences")
				.withIndex(
					"by_inbox_id_and_integration_id_and_external_thread_id",
					(index) =>
						index
							.eq("inboxId", inboxId)
							.eq("integrationId", integration._id)
							.eq("externalThreadId", `seed-suggestion-${suggestionEmail.key}`),
				)
				.unique();
			if (existingReference) {
				const messages = await ctx.db
					.query("emailMessages")
					.withIndex("by_thread_id_and_sent_at", (index) =>
						index.eq("threadId", existingReference.threadId),
					)
					.take(suggestionEmail.messages.length);
				for (const [messageIndex, message] of messages.entries()) {
					const subject = formatSeedMessageSubject(
						suggestionEmail.subject,
						messageIndex,
					);
					const textBody = suggestionEmail.messages[messageIndex]?.body;
					if (!textBody) {
						throw new Error("Suggestion seed message is missing");
					}
					if (message.subject !== subject || message.textBody !== textBody) {
						await ctx.db.patch(message._id, { subject, textBody });
					}
				}
				existingThreads += 1;
				continue;
			}
			await insertSuggestionEmailThread(ctx, {
				organizationId: organization._id,
				inboxId,
				integrationId: integration._id,
				seed: suggestionEmail,
				now,
			});
			createdThreads += 1;
		}

		await ctx.db.patch(inboxId, {
			unreadThreadCount: await countUnreadThreads(ctx, inboxId),
		});
		return { createdThreads, existingThreads, inboxId };
	},
});

export const seedAgentDemoEntities = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		confirmation: v.literal("seed-agent-demo-entities"),
	},
	returns: v.object({
		createdEntities: v.number(),
		existingEntities: v.number(),
		entityTypeId: v.id("entityTypes"),
	}),
	handler: async (ctx, args) => {
		const organization = await requireOrganization(ctx, args.organizationId);
		const entityTypeId = await getOrCreateAgentDemoEntityType(
			ctx,
			organization._id,
		);
		const fields = await getOrCreateAgentDemoFields(ctx, entityTypeId);
		const now = Date.now();
		let createdEntities = 0;
		let existingEntities = 0;

		for (const seed of ACME_AGENT_DEMO_ENTITIES) {
			const outcome = await upsertAgentDemoEntity(ctx, {
				organizationId: organization._id,
				entityTypeId,
				fields,
				seed,
				now,
			});
			if (outcome === "created") {
				createdEntities += 1;
			} else {
				existingEntities += 1;
			}
		}

		return { createdEntities, existingEntities, entityTypeId };
	},
});
