import {
	IconAddressBook,
	IconCircleCheckFilled,
	IconLoader2,
	IconPlus,
	IconX,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import { EntityIcon } from "#/lib/entity-icons.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { initials } from "./format.ts";
import type { CaseCreateOptions, CaseDetail } from "./types.ts";

export function CaseRelationships({
	detail,
	options,
}: {
	detail: CaseDetail;
	options: CaseCreateOptions | undefined;
}) {
	const currentContactIds = new Set(
		detail.contacts.flatMap((item) => (item.contact ? [item.contact._id] : [])),
	);
	const currentEntityIds = new Set(
		detail.entities.flatMap((item) => (item.entity ? [item.entity._id] : [])),
	);

	return (
		<>
			<section className="mt-8">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h2 className="text-sm font-semibold">Contacts</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							People and addresses directly involved in this case.
						</p>
					</div>
					<AddRelationshipDialog
						caseId={detail.case._id}
						options={options}
						currentContactIds={currentContactIds}
						currentEntityIds={currentEntityIds}
						trigger={
							<Button variant="ghost" size="sm">
								<IconPlus />
								Add
							</Button>
						}
					/>
				</div>
				<div className="mt-3 grid gap-2 sm:grid-cols-2">
					{detail.contacts.map(({ relation, contact }) =>
						contact ? (
							<Link
								key={relation._id}
								to="/contacts"
								search={{ contact: contact._id }}
								className="flex min-w-0 items-center gap-3 rounded-xl border p-3 text-foreground no-underline transition-colors hover:bg-muted"
							>
								<Avatar className="size-9">
									<AvatarFallback>
										{initials(contact.name || contact.address)}
									</AvatarFallback>
								</Avatar>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">
										{contact.name || contact.address}
									</span>
									{contact.name && (
										<span className="block truncate text-xs text-muted-foreground">
											{contact.address}
										</span>
									)}
								</span>
							</Link>
						) : null,
					)}
					{detail.contacts.length === 0 && (
						<p className="col-span-full rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
							No contacts related to this case.
						</p>
					)}
				</div>
			</section>

			<section className="mt-8">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h2 className="text-sm font-semibold">Relationships</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							Contacts and organization-defined entities in one view.
						</p>
					</div>
					<AddRelationshipDialog
						caseId={detail.case._id}
						options={options}
						currentContactIds={currentContactIds}
						currentEntityIds={currentEntityIds}
						trigger={
							<Button variant="outline" size="sm">
								<IconPlus />
								Add relationship
							</Button>
						}
					/>
				</div>

				<div className="mt-3 flex flex-wrap gap-2">
					{detail.contacts.map(({ relation, contact }) =>
						contact ? (
							<RelationshipPill
								key={`contact-${relation._id}`}
								icon={<IconAddressBook />}
								type="Contact"
								label={contact.name || contact.address}
								onRemove={{
									kind: "contact",
									relationId: relation._id,
								}}
							/>
						) : null,
					)}
					{detail.entities.map(({ relation, entity, entityType }) =>
						entity && entityType ? (
							<RelationshipPill
								key={`entity-${relation._id}`}
								icon={<EntityIcon icon={entityType.icon} />}
								type={entityType.name}
								label={entity.displayName}
								onRemove={{
									kind: "entity",
									relationId: relation._id,
								}}
							/>
						) : null,
					)}
					{detail.contacts.length === 0 && detail.entities.length === 0 && (
						<p className="w-full rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
							No relationships yet.
						</p>
					)}
				</div>
			</section>
		</>
	);
}

function RelationshipPill({
	icon,
	type,
	label,
	onRemove,
}: {
	icon: React.ReactNode;
	type: string;
	label: string;
	onRemove:
		| { kind: "contact"; relationId: Id<"caseContactRelations"> }
		| { kind: "entity"; relationId: Id<"caseEntityRelations"> };
}) {
	const removeContact = useMutation(api.case.mutations.removeContactRelation);
	const removeEntity = useMutation(api.case.mutations.removeEntityRelation);
	const [isRemoving, setIsRemoving] = useState(false);

	async function remove() {
		setIsRemoving(true);

		try {
			if (onRemove.kind === "contact") {
				await removeContact({ relationId: onRemove.relationId });
			} else {
				await removeEntity({ relationId: onRemove.relationId });
			}
		} finally {
			setIsRemoving(false);
		}
	}

	return (
		<div className="flex min-w-0 items-center gap-2 rounded-full border bg-muted/30 py-1.5 pr-1.5 pl-2.5">
			<span className="flex size-4 items-center justify-center text-muted-foreground [&_svg]:size-4">
				{icon}
			</span>
			<span className="max-w-48 truncate text-sm font-medium">{label}</span>
			<span className="text-xs text-muted-foreground">{type}</span>
			<button
				type="button"
				onClick={remove}
				disabled={isRemoving}
				className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
				aria-label={`Remove ${label}`}
			>
				{isRemoving ? (
					<IconLoader2 className="size-3.5 animate-spin" />
				) : (
					<IconX className="size-3.5" />
				)}
			</button>
		</div>
	);
}

function AddRelationshipDialog({
	caseId,
	options,
	currentContactIds,
	currentEntityIds,
	trigger,
}: {
	caseId: Id<"cases">;
	options: CaseCreateOptions | undefined;
	currentContactIds: Set<Id<"contacts">>;
	currentEntityIds: Set<Id<"entities">>;
	trigger: React.ReactNode;
}) {
	const addContact = useMutation(api.case.mutations.addContactRelation);
	const addEntity = useMutation(api.case.mutations.addEntityRelation);
	const [open, setOpen] = useState(false);
	const [pendingId, setPendingId] = useState<string | null>(null);

	async function selectContact(contactId: Id<"contacts">) {
		setPendingId(contactId);

		try {
			await addContact({ caseId, contactId });
			setOpen(false);
		} finally {
			setPendingId(null);
		}
	}

	async function selectEntity(entityId: Id<"entities">) {
		setPendingId(entityId);

		try {
			await addEntity({ caseId, entityId });
			setOpen(false);
		} finally {
			setPendingId(null);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Add relationship</DialogTitle>
					<DialogDescription>
						Choose a contact or an organization-defined entity.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5 pt-1">
					<div>
						<div className="mb-2 flex items-center gap-2">
							<IconAddressBook className="size-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">Contacts</h3>
						</div>
						<div className="space-y-1">
							{options?.contacts.map((contact) => {
								const alreadyAdded = currentContactIds.has(contact._id);

								return (
									<button
										key={contact._id}
										type="button"
										onClick={() => selectContact(contact._id)}
										disabled={alreadyAdded || pendingId !== null}
										className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
									>
										<Avatar className="size-8">
											<AvatarFallback className="text-xs">
												{initials(contact.name || contact.address)}
											</AvatarFallback>
										</Avatar>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">
												{contact.name || contact.address}
											</span>
											{contact.name && (
												<span className="block truncate text-xs text-muted-foreground">
													{contact.address}
												</span>
											)}
										</span>
										{alreadyAdded && (
											<IconCircleCheckFilled className="size-4 text-accent" />
										)}
										{pendingId === contact._id && (
											<IconLoader2 className="size-4 animate-spin" />
										)}
									</button>
								);
							})}
						</div>
					</div>

					{options?.entityTypes.map(({ entityType, entities }) => (
						<div key={entityType._id}>
							<div className="mb-2 flex items-center gap-2">
								<EntityIcon
									icon={entityType.icon}
									className="size-4 text-muted-foreground"
								/>
								<h3 className="text-sm font-semibold">
									{entityType.pluralName}
								</h3>
							</div>
							<div className="space-y-1">
								{entities.map((entity) => {
									const alreadyAdded = currentEntityIds.has(entity._id);

									return (
										<button
											key={entity._id}
											type="button"
											onClick={() => selectEntity(entity._id)}
											disabled={alreadyAdded || pendingId !== null}
											className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
										>
											<span className="flex size-8 items-center justify-center rounded-full bg-muted">
												<EntityIcon icon={entityType.icon} className="size-4" />
											</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm font-medium">
													{entity.displayName}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													{entity.identifier}
												</span>
											</span>
											{alreadyAdded && (
												<IconCircleCheckFilled className="size-4 text-accent" />
											)}
											{pendingId === entity._id && (
												<IconLoader2 className="size-4 animate-spin" />
											)}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
