import { normalizeEntityIdentifier } from "#/entity/constants";
import { syncGlobalSearchEntry } from "#/globalSearch/model";
import { getResendPipesProviderSlug } from "#/integrations/resendProvider";
import {
	ACME_CASE_RELATIONS,
	ACME_CASES,
	ACME_CONTACTS,
	ACME_DATASET_VERSION,
	ACME_EMAIL_THREADS,
	ACME_ENTITIES,
	ACME_ENTITY_TYPES,
	ACME_INBOX,
	type AcmeEmailMessageSeed,
	type AcmeEmailThreadSeed,
	assertAcmeDatasetIsInternallyConsistent,
	calculateAcmeCreationCounts,
	getAcmeCaseActivity,
	getAcmeContactActivity,
} from "#/seed/acmeData";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const DATASET_CREATED_AT = Date.parse("2026-06-01T08:00:00.000Z");
const INTEGRATION_UPDATED_AT = Date.parse("2026-08-01T08:00:00.000Z");
const INBOX_PARTICIPANT = {
	name: ACME_INBOX.displayName,
	address: ACME_INBOX.address,
};

function requireMappedValue<Key, Value>(
	map: ReadonlyMap<Key, Value>,
	key: Key,
	label: string,
) {
	const value = map.get(key);
	if (value === undefined) {
		throw new Error(`Acme seed could not resolve ${label}`);
	}
	return value;
}

function formatMessageSubject(subject: string, messageIndex: number) {
	return messageIndex === 0 ? subject : `Re: ${subject}`;
}

function getMessageInternetId(
	threadKey: string,
	message: AcmeEmailMessageSeed,
) {
	return `<${ACME_DATASET_VERSION}.${threadKey}.${message.key}@acme.seed.invalid>`;
}

function toParticipant(contact: (typeof ACME_CONTACTS)[number]) {
	return { name: contact.name, address: contact.address };
}

async function insertSeedContacts(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const contactIds = new Map<string, Id<"contacts">>();
	for (const contact of ACME_CONTACTS) {
		const activity = getAcmeContactActivity(contact.key);
		const contactId = await ctx.db.insert("contacts", {
			organizationId,
			address: contact.address,
			name: contact.name,
			...activity,
		});
		const globalSearchEntryId = await syncGlobalSearchEntry(ctx, undefined, {
			organizationId,
			target: { kind: "contact", contactId },
			identifier: contact.address,
			label: contact.name,
			descriptor: "Contact",
		});
		await ctx.db.patch("contacts", contactId, { globalSearchEntryId });
		contactIds.set(contact.key, contactId);
	}
	return contactIds;
}

async function insertSeedEntities(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const entityTypeIds = new Map<string, Id<"entityTypes">>();
	const fieldIds = new Map<string, Id<"entityFieldDefinitions">>();
	const entityIds = new Map<string, Id<"entities">>();

	for (const entityType of ACME_ENTITY_TYPES) {
		const entityTypeId = await ctx.db.insert("entityTypes", {
			organizationId,
			key: entityType.key,
			name: entityType.name,
			pluralName: entityType.pluralName,
			identifierLabel: entityType.identifierLabel,
			description: entityType.description,
			icon: entityType.icon,
			archivedAt: null,
		});
		entityTypeIds.set(entityType.key, entityTypeId);
		for (const [position, field] of entityType.fields.entries()) {
			const fieldId = await ctx.db.insert("entityFieldDefinitions", {
				entityTypeId,
				label: field.label,
				valueType: field.valueType,
				required: field.required,
				position,
				archivedAt: null,
			});
			fieldIds.set(`${entityType.key}:${field.key}`, fieldId);
		}
	}

	for (const entity of ACME_ENTITIES) {
		const entityTypeId = requireMappedValue(
			entityTypeIds,
			entity.entityTypeKey,
			`entity type ${entity.entityTypeKey}`,
		);
		const updatedAt = Math.max(
			DATASET_CREATED_AT,
			...ACME_CASES.filter((caseSeed) =>
				(caseSeed.entityKeys as readonly string[]).includes(entity.key),
			).map((caseSeed) => getAcmeCaseActivity(caseSeed.reference)),
		);
		const entityId = await ctx.db.insert("entities", {
			entityTypeId,
			identifier: entity.identifier,
			normalizedIdentifier: normalizeEntityIdentifier(entity.identifier),
			displayName: entity.displayName,
			createdAt: DATASET_CREATED_AT,
			updatedAt,
			archivedAt: null,
		});
		entityIds.set(entity.key, entityId);

		for (const value of entity.values) {
			const fieldDefinitionId = requireMappedValue(
				fieldIds,
				`${entity.entityTypeKey}:${value.fieldKey}`,
				`field ${value.fieldKey}`,
			);
			switch (value.kind) {
				case "text":
					await ctx.db.insert("entityTextFieldValues", {
						entityId,
						fieldDefinitionId,
						value: value.value,
					});
					break;
				case "number":
					await ctx.db.insert("entityNumberFieldValues", {
						entityId,
						fieldDefinitionId,
						value: value.value,
					});
					break;
				case "boolean":
					await ctx.db.insert("entityBooleanFieldValues", {
						entityId,
						fieldDefinitionId,
						value: value.value,
					});
					break;
				case "date":
					await ctx.db.insert("entityDateFieldValues", {
						entityId,
						fieldDefinitionId,
						value: value.value,
					});
					break;
			}
		}

		const entityType = requireMappedValue(
			new Map(ACME_ENTITY_TYPES.map((candidate) => [candidate.key, candidate])),
			entity.entityTypeKey,
			`entity definition ${entity.entityTypeKey}`,
		);
		const globalSearchEntryId = await syncGlobalSearchEntry(ctx, undefined, {
			organizationId,
			target: { kind: "entity", entityId, entityTypeId },
			identifier: entity.identifier,
			label: entity.displayName,
			descriptor: entityType.name,
		});
		await ctx.db.patch("entities", entityId, { globalSearchEntryId });
	}

	return entityIds;
}

async function insertSeedCases(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	owner: Doc<"organizationMembers">,
) {
	const caseIds = new Map<string, Id<"cases">>();
	for (const caseSeed of ACME_CASES) {
		const lastActivityAt = getAcmeCaseActivity(caseSeed.reference);
		const caseId = await ctx.db.insert("cases", {
			organizationId,
			reference: caseSeed.reference,
			title: caseSeed.title,
			description: caseSeed.description,
			ownerMemberId: caseSeed.owner === "primary" ? owner._id : null,
			dueAt: caseSeed.dueAt,
			status: caseSeed.status,
			lastActivityAt,
			createdAt: caseSeed.createdAt,
			updatedAt: lastActivityAt,
		});
		const globalSearchEntryId = await syncGlobalSearchEntry(ctx, undefined, {
			organizationId,
			target: { kind: "case", caseId },
			identifier: caseSeed.reference,
			label: caseSeed.title,
			descriptor: "Case",
		});
		await ctx.db.patch("cases", caseId, { globalSearchEntryId });
		caseIds.set(caseSeed.reference, caseId);
	}
	return caseIds;
}

type InsertedThread = {
	threadId: Id<"emailThreads">;
	messageIds: Map<string, Id<"emailMessages">>;
};

async function insertSeedEmail(
	ctx: MutationCtx,
	args: {
		organizationId: Id<"organizations">;
		owner: Doc<"organizationMembers">;
		integrationId: Id<"emailIntegrations">;
		inboxId: Id<"emailInboxes">;
		contactIds: ReadonlyMap<string, Id<"contacts">>;
	},
) {
	const contactByKey = new Map(
		ACME_CONTACTS.map((contact) => [contact.key, contact]),
	);
	const insertedThreads = new Map<string, InsertedThread>();

	for (const thread of ACME_EMAIL_THREADS as readonly AcmeEmailThreadSeed[]) {
		const latestMessageSeed = thread.messages.at(-1);
		if (!latestMessageSeed) {
			throw new Error(`Acme seed thread ${thread.key} has no messages`);
		}
		const threadId = await ctx.db.insert("emailThreads", {
			organizationId: args.organizationId,
			inboxId: args.inboxId,
			lastActivityAt: latestMessageSeed.sentAt,
			isUnread: thread.unread,
		});
		await ctx.db.insert("emailThreadExternalReferences", {
			threadId,
			inboxId: args.inboxId,
			integrationId: args.integrationId,
			externalThreadId: `seed:${ACME_DATASET_VERSION}:thread:${thread.key}`,
		});

		const internetMessageIds: string[] = [];
		const messageIds = new Map<string, Id<"emailMessages">>();
		let latestMessageId: Id<"emailMessages"> | undefined;
		for (const [messageIndex, message] of thread.messages.entries()) {
			const internetMessageId = getMessageInternetId(thread.key, message);
			const cc = (message.ccContactKeys ?? []).map((contactKey) =>
				toParticipant(
					requireMappedValue(
						contactByKey,
						contactKey,
						`email participant ${contactKey}`,
					),
				),
			);
			const commonFields = {
				inboxId: args.inboxId,
				integrationId: args.integrationId,
				threadId,
				internetMessageId,
				inReplyTo: internetMessageIds.at(-1),
				references: [...internetMessageIds],
				cc,
				bcc: [],
				replyTo: [],
				subject: formatMessageSubject(thread.subject, messageIndex),
				textBody: message.body,
				sentAt: message.sentAt,
			};

			if (message.direction === "inbound") {
				const from = requireMappedValue(
					contactByKey,
					message.fromContactKey,
					`sender ${message.fromContactKey}`,
				);
				latestMessageId = await ctx.db.insert("emailMessages", {
					...commonFields,
					direction: "inbound",
					senderContactId: requireMappedValue(
						args.contactIds,
						message.fromContactKey,
						`contact ${message.fromContactKey}`,
					),
					externalMessageId: `seed:${ACME_DATASET_VERSION}:inbound:${thread.key}:${message.key}`,
					from: toParticipant(from),
					to: [INBOX_PARTICIPANT],
					receivedAt: message.sentAt,
				});
			} else {
				const to = message.toContactKeys.map((contactKey) =>
					toParticipant(
						requireMappedValue(
							contactByKey,
							contactKey,
							`recipient ${contactKey}`,
						),
					),
				);
				latestMessageId = await ctx.db.insert("emailMessages", {
					...commonFields,
					direction: "outbound",
					authoredByMemberId: args.owner._id,
					externalMessageId: `seed:${ACME_DATASET_VERSION}:outbound:${thread.key}:${message.key}`,
					from: INBOX_PARTICIPANT,
					to,
				});
				await ctx.db.insert("emailSends", {
					messageId: latestMessageId,
					requestedByMemberId: args.owner._id,
					clientRequestId: `seed:${ACME_DATASET_VERSION}:${thread.key}:${message.key}`,
					status: "sent",
					generation: 0,
					attemptCount: 1,
					lastAttemptAt: message.sentAt,
					acceptedAt: message.sentAt,
				});
			}

			messageIds.set(message.key, latestMessageId);
			internetMessageIds.push(internetMessageId);
		}
		if (!latestMessageId) {
			throw new Error(`Acme seed thread ${thread.key} has no latest message`);
		}
		await ctx.db.patch("emailThreads", threadId, { latestMessageId });
		insertedThreads.set(thread.key, { threadId, messageIds });
	}

	return insertedThreads;
}

async function insertSeedRelationsAndEvents(
	ctx: MutationCtx,
	args: {
		owner: Doc<"organizationMembers">;
		caseIds: ReadonlyMap<string, Id<"cases">>;
		contactIds: ReadonlyMap<string, Id<"contacts">>;
		entityIds: ReadonlyMap<string, Id<"entities">>;
		threads: ReadonlyMap<string, InsertedThread>;
	},
) {
	for (const caseSeed of ACME_CASES) {
		const caseId = requireMappedValue(
			args.caseIds,
			caseSeed.reference,
			`case ${caseSeed.reference}`,
		);
		for (const contactKey of caseSeed.contactKeys) {
			await ctx.db.insert("caseContactRelations", {
				caseId,
				contactId: requireMappedValue(
					args.contactIds,
					contactKey,
					`contact ${contactKey}`,
				),
				startedAt: caseSeed.createdAt,
				endedAt: null,
				addedByMemberId: args.owner._id,
				removedByMemberId: null,
			});
		}
		for (const entityKey of caseSeed.entityKeys) {
			await ctx.db.insert("caseEntityRelations", {
				caseId,
				entityId: requireMappedValue(
					args.entityIds,
					entityKey,
					`entity ${entityKey}`,
				),
				startedAt: caseSeed.createdAt,
				endedAt: null,
				addedByMemberId: args.owner._id,
				removedByMemberId: null,
			});
		}
	}

	for (const [firstReference, secondReference] of ACME_CASE_RELATIONS) {
		const firstCaseId = requireMappedValue(
			args.caseIds,
			firstReference,
			`case ${firstReference}`,
		);
		const secondCaseId = requireMappedValue(
			args.caseIds,
			secondReference,
			`case ${secondReference}`,
		);
		const [caseId, relatedCaseId] =
			firstCaseId < secondCaseId
				? [firstCaseId, secondCaseId]
				: [secondCaseId, firstCaseId];
		const firstCase = ACME_CASES.find(
			(caseSeed) => caseSeed.reference === firstReference,
		);
		const secondCase = ACME_CASES.find(
			(caseSeed) => caseSeed.reference === secondReference,
		);
		if (!firstCase || !secondCase) {
			throw new Error("Acme seed relation has a missing case");
		}
		await ctx.db.insert("caseCaseRelations", {
			caseId,
			relatedCaseId,
			startedAt: Math.max(firstCase.createdAt, secondCase.createdAt),
			endedAt: null,
			addedByMemberId: args.owner._id,
			removedByMemberId: null,
		});
	}

	for (const thread of ACME_EMAIL_THREADS) {
		if (!thread.caseReference) continue;
		const caseSeed = ACME_CASES.find(
			(candidate) => candidate.reference === thread.caseReference,
		);
		if (!caseSeed) {
			throw new Error(`Acme seed thread ${thread.key} has a missing case`);
		}
		const caseId = requireMappedValue(
			args.caseIds,
			thread.caseReference,
			`case ${thread.caseReference}`,
		);
		const insertedThread = requireMappedValue(
			args.threads,
			thread.key,
			`thread ${thread.key}`,
		);
		await ctx.db.insert("caseEmailThreadRelations", {
			caseId,
			threadId: insertedThread.threadId,
			startedAt: caseSeed.createdAt,
			endedAt: null,
			linkedByMemberId: args.owner._id,
			unlinkedByMemberId: null,
		});
	}

	for (const caseSeed of ACME_CASES) {
		const caseId = requireMappedValue(
			args.caseIds,
			caseSeed.reference,
			`case ${caseSeed.reference}`,
		);
		const eventSeeds: Array<
			| { kind: "human_note"; occurredAt: number; body: string }
			| { kind: "system_change"; occurredAt: number; body: string }
			| {
					kind: "inbound_email" | "outbound_email";
					occurredAt: number;
					messageId: Id<"emailMessages">;
			  }
		> = [
			{
				kind: "human_note",
				occurredAt: caseSeed.createdAt,
				body: caseSeed.initialNote,
			},
			...caseSeed.history.map((event) => ({
				kind: "system_change" as const,
				...event,
			})),
		];
		for (const thread of ACME_EMAIL_THREADS) {
			if (thread.caseReference !== caseSeed.reference) continue;
			const insertedThread = requireMappedValue(
				args.threads,
				thread.key,
				`thread ${thread.key}`,
			);
			for (const message of thread.messages) {
				eventSeeds.push({
					kind:
						message.direction === "inbound"
							? "inbound_email"
							: "outbound_email",
					occurredAt: message.sentAt,
					messageId: requireMappedValue(
						insertedThread.messageIds,
						message.key,
						`message ${message.key}`,
					),
				});
			}
		}

		for (const event of eventSeeds.sort(
			(left, right) => left.occurredAt - right.occurredAt,
		)) {
			if (event.kind === "human_note" || event.kind === "system_change") {
				await ctx.db.insert("caseEvents", {
					caseId,
					type: event.kind,
					body: event.body,
					occurredAt: event.occurredAt,
					createdAt: Math.max(caseSeed.createdAt, event.occurredAt),
					createdByMemberId: args.owner._id,
				});
			} else if (event.kind === "outbound_email") {
				await ctx.db.insert("caseEvents", {
					caseId,
					type: "outbound_email",
					emailMessageId: event.messageId,
					occurredAt: event.occurredAt,
					createdAt: Math.max(caseSeed.createdAt, event.occurredAt),
					createdByMemberId: args.owner._id,
				});
			} else {
				await ctx.db.insert("caseEvents", {
					caseId,
					type: "inbound_email",
					emailMessageId: event.messageId,
					occurredAt: event.occurredAt,
					createdAt: Math.max(caseSeed.createdAt, event.occurredAt),
					createdByMemberId: null,
				});
			}
		}
	}
}

export async function insertAcmeDataset(
	ctx: MutationCtx,
	organization: Doc<"organizations">,
	owner: Doc<"organizationMembers">,
) {
	assertAcmeDatasetIsInternallyConsistent();
	const connectedAccountId = await ctx.db.insert("connectedAccounts", {
		organizationId: organization._id,
		providerSlug: getResendPipesProviderSlug(),
		workosUserId: owner.workosUserId,
		workosDataIntegrationId: `seed:${ACME_DATASET_VERSION}`,
		workosConnectedAccountId: `seed:${ACME_DATASET_VERSION}:${organization._id}`,
		connectionStatus: "disconnected",
		grantedScopes: [],
		workosUpdatedAt: INTEGRATION_UPDATED_AT,
	});
	const integrationId = await ctx.db.insert("emailIntegrations", {
		connectedAccountId,
	});
	const inboxId = await ctx.db.insert("emailInboxes", {
		organizationId: organization._id,
		...ACME_INBOX,
		status: "active",
		unreadThreadCount: ACME_EMAIL_THREADS.filter((thread) => thread.unread)
			.length,
	});
	const contactIds = await insertSeedContacts(ctx, organization._id);
	const entityIds = await insertSeedEntities(ctx, organization._id);
	const caseIds = await insertSeedCases(ctx, organization._id, owner);
	const threads = await insertSeedEmail(ctx, {
		organizationId: organization._id,
		owner,
		integrationId,
		inboxId,
		contactIds,
	});
	await insertSeedRelationsAndEvents(ctx, {
		owner,
		caseIds,
		contactIds,
		entityIds,
		threads,
	});
	return {
		counts: calculateAcmeCreationCounts(),
		inboxId,
		integrationId,
	};
}
