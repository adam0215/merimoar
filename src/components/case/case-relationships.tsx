import {
	IconAddressBook,
	IconAlertCircle,
	IconCircleCheckFilled,
	IconLoader2,
	IconPlus,
	IconX,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
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
		<section className="mt-10 border-t pt-8">
			<div>
				<h2 className="text-sm font-semibold">Relationships</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					People and records connected to this case.
				</p>
			</div>

			<div className="mt-4 grid gap-2 sm:grid-cols-2">
				{detail.contacts.map(({ relation, contact }) =>
					contact ? (
						<div
							key={relation._id}
							className="flex min-w-0 items-center gap-2 rounded-xl border bg-background p-2"
						>
							<Link
								to="/contacts"
								search={{ contact: contact._id }}
								className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-foreground no-underline transition-colors hover:bg-muted"
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
									<span className="block truncate text-xs text-muted-foreground">
										{contact.name ? contact.address : "Contact"}
									</span>
								</span>
							</Link>
							<RemoveRelationshipButton
								label={contact.name || contact.address}
								relation={{
									kind: "contact",
									relationId: relation._id,
								}}
							/>
						</div>
					) : null,
				)}
				{detail.entities.map(({ relation, entity, entityType }) =>
					entity && entityType ? (
						<div
							key={relation._id}
							className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3"
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<EntityIcon icon={entityType.icon} className="size-4" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium">
									{entity.displayName}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{entityType.name} · {entity.identifier}
								</span>
							</span>
							<RemoveRelationshipButton
								label={entity.displayName}
								relation={{
									kind: "entity",
									relationId: relation._id,
								}}
							/>
						</div>
					) : null,
				)}
				<AddRelationshipDialog
					caseId={detail.case._id}
					options={options}
					currentContactIds={currentContactIds}
					currentEntityIds={currentEntityIds}
					trigger={
						<button
							type="button"
							className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left text-muted-foreground transition-[color,background-color,transform] hover:bg-muted/50 hover:text-foreground active:scale-99"
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
								<IconPlus className="size-4" />
							</span>
							<span className="text-sm font-medium">Add relationship</span>
						</button>
					}
				/>
			</div>
		</section>
	);
}

function RemoveRelationshipButton({
	label,
	relation,
}: {
	label: string;
	relation:
		| { kind: "contact"; relationId: Id<"caseContactRelations"> }
		| { kind: "entity"; relationId: Id<"caseEntityRelations"> };
}) {
	const removeContact = useMutation(api.case.mutations.removeContactRelation);
	const removeEntity = useMutation(api.case.mutations.removeEntityRelation);
	const [isRemoving, setIsRemoving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function remove() {
		setIsRemoving(true);
		setError(null);

		try {
			if (relation.kind === "contact") {
				await removeContact({ relationId: relation.relationId });
			} else {
				await removeEntity({ relationId: relation.relationId });
			}
		} catch (caughtError) {
			setError(
				getConvexErrorMessage(
					caughtError,
					"Relationship could not be removed.",
				),
			);
		} finally {
			setIsRemoving(false);
		}
	}

	return (
		<button
			type="button"
			onClick={remove}
			disabled={isRemoving}
			className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] hover:bg-muted hover:text-foreground active:scale-97 disabled:opacity-50"
			aria-label={`${error ? "Retry removing" : "Remove"} ${label}`}
			title={error ?? `Remove ${label}`}
		>
			{isRemoving ? (
				<IconLoader2 className="size-3.5 animate-spin" />
			) : error ? (
				<IconAlertCircle className="size-4 text-destructive" />
			) : (
				<IconX className="size-4" />
			)}
		</button>
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
	trigger: React.ReactElement;
}) {
	const addContact = useMutation(api.case.mutations.addContactRelation);
	const addEntity = useMutation(api.case.mutations.addEntityRelation);
	const [open, setOpen] = useState(false);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function selectContact(contactId: Id<"contacts">) {
		setPendingId(contactId);
		setError(null);

		try {
			await addContact({ caseId, contactId });
			setOpen(false);
		} catch (caughtError) {
			setError(
				getConvexErrorMessage(caughtError, "Contact could not be added."),
			);
		} finally {
			setPendingId(null);
		}
	}

	async function selectEntity(entityId: Id<"entities">) {
		setPendingId(entityId);
		setError(null);

		try {
			await addEntity({ caseId, entityId });
			setOpen(false);
		} catch (caughtError) {
			setError(
				getConvexErrorMessage(caughtError, "Record could not be added."),
			);
		} finally {
			setPendingId(null);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (nextOpen) {
					setError(null);
				}
			}}
		>
			<DialogTrigger render={trigger} />
			<DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Add relationship</DialogTitle>
					<DialogDescription>
						Choose a contact or an organization-defined entity.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5 pt-1">
					{error && (
						<p
							className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
							role="alert"
						>
							<IconAlertCircle className="size-4 shrink-0" />
							{error}
						</p>
					)}
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
