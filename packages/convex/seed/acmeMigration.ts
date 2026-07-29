import { v } from "convex/values";
import { getOrCreateSeedEmailIntegration } from "#/seed/acme";
import { ACME_CASES, ACME_INBOX } from "#/seed/acmeData";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";

const LEGACY_INBOX_ADDRESS =
	"kundservice@seed.sundhamn-energi.invalid" as const;
const LEGACY_INBOX_NAME = "Sundhamn Energi — seeddata" as const;
const LEGACY_EMAIL_DOMAIN = "seed.sundhamn-energi.invalid" as const;
const ACME_EMAIL_DOMAIN = "seed.acme.invalid" as const;

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db">;

async function findOrganization(
	ctx: DatabaseContext,
	workosOrganizationId: string,
) {
	return await ctx.db
		.query("organizations")
		.withIndex("by_workos_organization_id", (index) =>
			index.eq("workosOrganizationId", workosOrganizationId),
		)
		.unique();
}

async function findCase(
	ctx: DatabaseContext,
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

async function findInbox(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
	address: string,
) {
	return await ctx.db
		.query("emailInboxes")
		.withIndex("by_organization_id_and_address", (index) =>
			index.eq("organizationId", organizationId).eq("address", address),
		)
		.unique();
}

function rewriteAcmeText(value: string) {
	return value
		.replaceAll(LEGACY_INBOX_NAME, ACME_INBOX.displayName)
		.replaceAll("Sundhamn Energi", "Acme AB")
		.replaceAll(LEGACY_EMAIL_DOMAIN, ACME_EMAIL_DOMAIN);
}

function rewriteParticipant(participant: { address: string; name?: string }) {
	return {
		address: rewriteAcmeText(participant.address),
		...(participant.name
			? { name: rewriteAcmeText(participant.name) }
			: undefined),
	};
}

function countLegacyMessageFields(message: Doc<"emailMessages">) {
	const values = [
		message.internetMessageId,
		message.inReplyTo,
		...message.references,
		message.from.address,
		message.from.name,
		...message.to.flatMap((participant) => [
			participant.address,
			participant.name,
		]),
		...message.cc.flatMap((participant) => [
			participant.address,
			participant.name,
		]),
		...message.bcc.flatMap((participant) => [
			participant.address,
			participant.name,
		]),
		...message.replyTo.flatMap((participant) => [
			participant.address,
			participant.name,
		]),
		message.subject,
		message.textBody,
	];
	return values.filter(
		(value) =>
			value?.includes(LEGACY_EMAIL_DOMAIN) ||
			value?.includes("Sundhamn Energi"),
	).length;
}

async function collectCasesByOrganization(
	ctx: DatabaseContext,
	organizationId: Id<"organizations">,
) {
	const cases = await Promise.all(
		ACME_CASES.map((seedCase) =>
			findCase(ctx, organizationId, seedCase.reference),
		),
	);
	return cases.filter((caseRecord) => caseRecord !== null);
}

async function collectSeedThreadIds(
	ctx: DatabaseContext,
	cases: Doc<"cases">[],
) {
	const relationGroups = await Promise.all(
		cases.map((caseRecord) =>
			ctx.db
				.query("caseEmailThreadRelations")
				.withIndex("by_case_id_and_ended_at", (index) =>
					index.eq("caseId", caseRecord._id),
				)
				.collect(),
		),
	);
	return new Set(relationGroups.flat().map((relation) => relation.threadId));
}

export const inspectMove = internalQuery({
	args: {
		sourceWorkosOrganizationId: v.string(),
		targetWorkosOrganizationId: v.string(),
	},
	returns: v.object({
		sourceOrganizationFound: v.boolean(),
		targetOrganizationFound: v.boolean(),
		sourceCases: v.number(),
		targetCases: v.number(),
		sourceInboxFound: v.boolean(),
		targetInboxFound: v.boolean(),
		targetThreads: v.number(),
		targetMessages: v.number(),
		legacyMessageFields: v.number(),
	}),
	handler: async (ctx, args) => {
		const [sourceOrganization, targetOrganization] = await Promise.all([
			findOrganization(ctx, args.sourceWorkosOrganizationId),
			findOrganization(ctx, args.targetWorkosOrganizationId),
		]);
		const sourceCases = sourceOrganization
			? await collectCasesByOrganization(ctx, sourceOrganization._id)
			: [];
		const targetCases = targetOrganization
			? await collectCasesByOrganization(ctx, targetOrganization._id)
			: [];
		const [sourceLegacyInbox, sourceAcmeInbox, targetInbox] = await Promise.all(
			[
				sourceOrganization
					? findInbox(ctx, sourceOrganization._id, LEGACY_INBOX_ADDRESS)
					: null,
				sourceOrganization
					? findInbox(ctx, sourceOrganization._id, ACME_INBOX.address)
					: null,
				targetOrganization
					? findInbox(ctx, targetOrganization._id, ACME_INBOX.address)
					: null,
			],
		);
		const targetThreadIds = await collectSeedThreadIds(ctx, targetCases);
		const targetMessages = (
			await Promise.all(
				[...targetThreadIds].map((threadId) =>
					ctx.db
						.query("emailMessages")
						.withIndex("by_thread_id_and_sent_at", (index) =>
							index.eq("threadId", threadId),
						)
						.collect(),
				),
			)
		).flat();

		return {
			sourceOrganizationFound: sourceOrganization !== null,
			targetOrganizationFound: targetOrganization !== null,
			sourceCases: sourceCases.length,
			targetCases: targetCases.length,
			sourceInboxFound: sourceLegacyInbox !== null || sourceAcmeInbox !== null,
			targetInboxFound: targetInbox !== null,
			targetThreads: targetThreadIds.size,
			targetMessages: targetMessages.length,
			legacyMessageFields: targetMessages.reduce(
				(count, message) => count + countLegacyMessageFields(message),
				0,
			),
		};
	},
});

export const moveToAcme = internalMutation({
	args: {
		sourceWorkosOrganizationId: v.string(),
		targetWorkosOrganizationId: v.string(),
		confirmation: v.literal("move-seed-data-to-acme-ab"),
	},
	returns: v.object({
		alreadyMoved: v.boolean(),
		movedCases: v.number(),
		movedContacts: v.number(),
		movedThreads: v.number(),
		movedMessages: v.number(),
		movedSends: v.number(),
		movedEvents: v.number(),
		inboxId: v.id("emailInboxes"),
	}),
	handler: async (ctx, args) => {
		const [sourceOrganization, targetOrganization] = await Promise.all([
			findOrganization(ctx, args.sourceWorkosOrganizationId),
			findOrganization(ctx, args.targetWorkosOrganizationId),
		]);
		if (!sourceOrganization) {
			throw new Error("The source organization does not exist");
		}
		if (!targetOrganization?.active) {
			throw new Error("Acme AB is not an active organization");
		}
		if (sourceOrganization._id === targetOrganization._id) {
			throw new Error("Source and target organizations must differ");
		}

		const sourceCases: Doc<"cases">[] = [];
		const targetCases: Doc<"cases">[] = [];
		for (const seedCase of ACME_CASES) {
			const [sourceCase, targetCase] = await Promise.all([
				findCase(ctx, sourceOrganization._id, seedCase.reference),
				findCase(ctx, targetOrganization._id, seedCase.reference),
			]);
			if (sourceCase && targetCase) {
				throw new Error(
					`Seed case ${seedCase.reference} exists in both organizations`,
				);
			}
			if (sourceCase) {
				sourceCases.push(sourceCase);
			}
			if (targetCase) {
				targetCases.push(targetCase);
			}
		}
		if (sourceCases.length + targetCases.length !== ACME_CASES.length) {
			throw new Error("The complete 15-case seed dataset could not be found");
		}

		const [sourceLegacyInbox, sourceAcmeInbox, targetInbox] = await Promise.all(
			[
				findInbox(ctx, sourceOrganization._id, LEGACY_INBOX_ADDRESS),
				findInbox(ctx, sourceOrganization._id, ACME_INBOX.address),
				findInbox(ctx, targetOrganization._id, ACME_INBOX.address),
			],
		);
		const sourceInbox = sourceLegacyInbox ?? sourceAcmeInbox;
		if (sourceCases.length === 0) {
			if (!targetInbox || targetCases.length !== ACME_CASES.length) {
				throw new Error("The seed cases moved but the Acme inbox is missing");
			}
			return {
				alreadyMoved: true,
				movedCases: 0,
				movedContacts: 0,
				movedThreads: 0,
				movedMessages: 0,
				movedSends: 0,
				movedEvents: 0,
				inboxId: targetInbox._id,
			};
		}
		if (!sourceInbox) {
			throw new Error("The source seed inbox does not exist");
		}
		if (targetInbox && targetInbox._id !== sourceInbox._id) {
			throw new Error("Acme AB already has a different seed inbox");
		}

		const [sourceMembers, targetMembers] = await Promise.all([
			ctx.db
				.query("organizationMembers")
				.withIndex("by_organization_id_and_workos_user_id", (index) =>
					index.eq("organizationId", sourceOrganization._id),
				)
				.collect(),
			ctx.db
				.query("organizationMembers")
				.withIndex("by_organization_id_and_workos_user_id", (index) =>
					index.eq("organizationId", targetOrganization._id),
				)
				.collect(),
		]);
		const sourceMembersById = new Map(
			sourceMembers.map((member) => [member._id, member]),
		);
		const targetMembersByWorkosUserId = new Map(
			targetMembers
				.filter((member) => member.active)
				.map((member) => [member.workosUserId, member]),
		);
		const mapMemberId = (
			memberId: Id<"organizationMembers"> | null,
		): Id<"organizationMembers"> | null => {
			if (memberId === null) {
				return null;
			}
			const sourceMember = sourceMembersById.get(memberId);
			const targetMember = sourceMember
				? targetMembersByWorkosUserId.get(sourceMember.workosUserId)
				: undefined;
			if (!sourceMember || !targetMember) {
				throw new Error(`No active Acme membership maps ${memberId}`);
			}
			return targetMember._id;
		};
		const mapRequiredMemberId = (
			memberId: Id<"organizationMembers">,
		): Id<"organizationMembers"> => {
			const targetMemberId = mapMemberId(memberId);
			if (!targetMemberId) {
				throw new Error(`No Acme membership maps ${memberId}`);
			}
			return targetMemberId;
		};
		const seedOwnerId = sourceCases
			.map((caseRecord) => caseRecord.ownerMemberId)
			.find((memberId) => memberId !== null);
		if (!seedOwnerId) {
			throw new Error("The seed dataset has no owner to map to Acme AB");
		}
		const targetOwnerId = mapRequiredMemberId(seedOwnerId);
		const targetOwner = await ctx.db.get(targetOwnerId);
		if (!targetOwner) {
			throw new Error("The mapped Acme seed owner does not exist");
		}

		const caseIds = new Set(sourceCases.map((caseRecord) => caseRecord._id));
		const contactRelations = (
			await Promise.all(
				sourceCases.map((caseRecord) =>
					ctx.db
						.query("caseContactRelations")
						.withIndex("by_case_id_and_ended_at", (index) =>
							index.eq("caseId", caseRecord._id),
						)
						.collect(),
				),
			)
		).flat();
		const emailThreadRelations = (
			await Promise.all(
				sourceCases.map((caseRecord) =>
					ctx.db
						.query("caseEmailThreadRelations")
						.withIndex("by_case_id_and_ended_at", (index) =>
							index.eq("caseId", caseRecord._id),
						)
						.collect(),
				),
			)
		).flat();
		const [entityRelations, outgoingCaseRelations, incomingCaseRelations] =
			await Promise.all([
				Promise.all(
					sourceCases.map((caseRecord) =>
						ctx.db
							.query("caseEntityRelations")
							.withIndex("by_case_id_and_ended_at", (index) =>
								index.eq("caseId", caseRecord._id),
							)
							.collect(),
					),
				).then((relations) => relations.flat()),
				Promise.all(
					sourceCases.map((caseRecord) =>
						ctx.db
							.query("caseCaseRelations")
							.withIndex("by_case_id_and_ended_at", (index) =>
								index.eq("caseId", caseRecord._id),
							)
							.collect(),
					),
				).then((relations) => relations.flat()),
				Promise.all(
					sourceCases.map((caseRecord) =>
						ctx.db
							.query("caseCaseRelations")
							.withIndex("by_related_case_id_and_ended_at", (index) =>
								index.eq("relatedCaseId", caseRecord._id),
							)
							.collect(),
					),
				).then((relations) => relations.flat()),
			]);
		if (
			entityRelations.length > 0 ||
			outgoingCaseRelations.length > 0 ||
			incomingCaseRelations.length > 0
		) {
			throw new Error(
				"Seed cases have non-seed entity or case relations; move aborted",
			);
		}

		const contactIds = new Set(
			contactRelations.map((relation) => relation.contactId),
		);
		const contacts = await Promise.all(
			[...contactIds].map(async (contactId) => {
				const contact = await ctx.db.get(contactId);
				if (!contact || contact.organizationId !== sourceOrganization._id) {
					throw new Error("A seed contact does not belong to the source");
				}
				const targetContact = await ctx.db
					.query("contacts")
					.withIndex("by_organization_id_and_address", (index) =>
						index
							.eq("organizationId", targetOrganization._id)
							.eq("address", contact.address),
					)
					.unique();
				if (targetContact && targetContact._id !== contact._id) {
					throw new Error(`Acme AB already has contact ${contact.address}`);
				}
				const allRelations = await ctx.db
					.query("caseContactRelations")
					.withIndex("by_contact_id_and_ended_at", (index) =>
						index.eq("contactId", contact._id),
					)
					.collect();
				if (allRelations.some((relation) => !caseIds.has(relation.caseId))) {
					throw new Error(
						`Seed contact ${contact.address} is linked to a non-seed case`,
					);
				}
				return contact;
			}),
		);

		const threadIds = new Set(
			emailThreadRelations.map((relation) => relation.threadId),
		);
		const inboxThreads = await ctx.db
			.query("emailThreads")
			.withIndex(
				"by_organization_id_and_inbox_id_and_last_activity_at",
				(index) =>
					index
						.eq("organizationId", sourceOrganization._id)
						.eq("inboxId", sourceInbox._id),
			)
			.collect();
		if (
			inboxThreads.some((thread) => !threadIds.has(thread._id)) ||
			inboxThreads.length !== threadIds.size
		) {
			throw new Error("The seed inbox contains non-seed or missing threads");
		}
		const threads = await Promise.all(
			[...threadIds].map(async (threadId) => {
				const thread = await ctx.db.get(threadId);
				if (
					!thread ||
					thread.organizationId !== sourceOrganization._id ||
					thread.inboxId !== sourceInbox._id
				) {
					throw new Error("A seed thread does not belong to the source inbox");
				}
				const allRelations = await ctx.db
					.query("caseEmailThreadRelations")
					.withIndex("by_thread_id_and_ended_at", (index) =>
						index.eq("threadId", thread._id),
					)
					.collect();
				if (allRelations.some((relation) => !caseIds.has(relation.caseId))) {
					throw new Error("A seed thread is linked to a non-seed case");
				}
				return thread;
			}),
		);
		const messages = (
			await Promise.all(
				threads.map((thread) =>
					ctx.db
						.query("emailMessages")
						.withIndex("by_thread_id_and_sent_at", (index) =>
							index.eq("threadId", thread._id),
						)
						.collect(),
				),
			)
		).flat();
		const sends = (
			await Promise.all(
				messages.flatMap((message) =>
					message.direction === "outbound"
						? [
								ctx.db
									.query("emailSends")
									.withIndex("by_message_id", (index) =>
										index.eq("messageId", message._id),
									)
									.unique(),
							]
						: [],
				),
			)
		).filter((send) => send !== null);
		const externalReferences = (
			await Promise.all(
				threads.map((thread) =>
					ctx.db
						.query("emailThreadExternalReferences")
						.withIndex("by_thread_id", (index) =>
							index.eq("threadId", thread._id),
						)
						.collect(),
				),
			)
		).flat();
		const drafts = (
			await Promise.all(
				threads.map((thread) =>
					ctx.db
						.query("emailDrafts")
						.withIndex("by_thread_id_and_author_member_id", (index) =>
							index.eq("threadId", thread._id),
						)
						.collect(),
				),
			)
		).flat();
		const events = (
			await Promise.all(
				sourceCases.map((caseRecord) =>
					ctx.db
						.query("caseEvents")
						.withIndex("by_case_id_and_occurred_at", (index) =>
							index.eq("caseId", caseRecord._id),
						)
						.collect(),
				),
			)
		).flat();
		const ingestEvents = (
			await ctx.db.query("emailIngestEvents").collect()
		).filter((event) => event.inboxId === sourceInbox._id);
		const ingestRecipients = (
			await Promise.all(
				ingestEvents.map((event) =>
					ctx.db
						.query("emailIngestRecipients")
						.withIndex("by_event_id_and_address", (index) =>
							index.eq("eventId", event._id),
						)
						.collect(),
				),
			)
		).flat();

		const targetIntegration = await getOrCreateSeedEmailIntegration(
			ctx,
			targetOrganization,
			targetOwner,
		);

		await ctx.db.patch(sourceInbox._id, {
			organizationId: targetOrganization._id,
			displayName: ACME_INBOX.displayName,
			address: ACME_INBOX.address,
			outbound: undefined,
		});
		for (const caseRecord of sourceCases) {
			await ctx.db.patch(caseRecord._id, {
				organizationId: targetOrganization._id,
				ownerMemberId: mapMemberId(caseRecord.ownerMemberId),
			});
			if (caseRecord.globalSearchEntryId) {
				await ctx.db.patch(caseRecord.globalSearchEntryId, {
					organizationId: targetOrganization._id,
				});
			}
		}
		for (const contact of contacts) {
			await ctx.db.patch(contact._id, {
				organizationId: targetOrganization._id,
			});
			if (contact.globalSearchEntryId) {
				await ctx.db.patch(contact.globalSearchEntryId, {
					organizationId: targetOrganization._id,
				});
			}
		}
		for (const thread of threads) {
			await ctx.db.patch(thread._id, {
				organizationId: targetOrganization._id,
			});
		}
		for (const relation of contactRelations) {
			await ctx.db.patch(relation._id, {
				addedByMemberId: mapMemberId(relation.addedByMemberId),
				removedByMemberId: mapMemberId(relation.removedByMemberId),
			});
		}
		for (const relation of emailThreadRelations) {
			await ctx.db.patch(relation._id, {
				linkedByMemberId: mapMemberId(relation.linkedByMemberId),
				unlinkedByMemberId: mapMemberId(relation.unlinkedByMemberId),
			});
		}
		for (const event of events) {
			await ctx.db.patch(event._id, {
				...("body" in event
					? { body: rewriteAcmeText(event.body) }
					: undefined),
				createdByMemberId: mapMemberId(event.createdByMemberId),
			});
		}
		for (const message of messages) {
			const messageFields = {
				integrationId: targetIntegration._id,
				internetMessageId: message.internetMessageId
					? rewriteAcmeText(message.internetMessageId)
					: undefined,
				inReplyTo: message.inReplyTo
					? rewriteAcmeText(message.inReplyTo)
					: undefined,
				references: message.references.map(rewriteAcmeText),
				from: rewriteParticipant(message.from),
				to: message.to.map(rewriteParticipant),
				cc: message.cc.map(rewriteParticipant),
				bcc: message.bcc.map(rewriteParticipant),
				replyTo: message.replyTo.map(rewriteParticipant),
				subject: rewriteAcmeText(message.subject),
				textBody: rewriteAcmeText(message.textBody),
			};
			await ctx.db.patch(
				message._id,
				message.direction === "outbound"
					? {
							...messageFields,
							authoredByMemberId: mapRequiredMemberId(
								message.authoredByMemberId,
							),
						}
					: messageFields,
			);
		}
		for (const send of sends) {
			await ctx.db.patch(send._id, {
				requestedByMemberId: mapRequiredMemberId(send.requestedByMemberId),
			});
		}
		for (const reference of externalReferences) {
			await ctx.db.patch(reference._id, {
				inboxId: sourceInbox._id,
				integrationId: targetIntegration._id,
			});
		}
		for (const draft of drafts) {
			await ctx.db.patch(draft._id, {
				authorMemberId: mapRequiredMemberId(draft.authorMemberId),
			});
		}
		for (const event of ingestEvents) {
			await ctx.db.patch(event._id, {
				integrationId: targetIntegration._id,
				rawPayload: rewriteAcmeText(event.rawPayload),
			});
		}
		for (const recipient of ingestRecipients) {
			await ctx.db.patch(recipient._id, {
				address: rewriteAcmeText(recipient.address),
			});
		}

		return {
			alreadyMoved: false,
			movedCases: sourceCases.length,
			movedContacts: contacts.length,
			movedThreads: threads.length,
			movedMessages: messages.length,
			movedSends: sends.length,
			movedEvents: events.length,
			inboxId: sourceInbox._id,
		};
	},
});
