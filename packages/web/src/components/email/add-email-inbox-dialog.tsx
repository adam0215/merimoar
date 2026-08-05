import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import {
	emailInboxAddressSchema,
	emailInboxDetailsSchema,
	emailInboxNameSchema,
} from "@merimoar/convex/email/input";
import {
	IconCheck,
	IconInbox,
	IconLoader2,
	IconPencil,
	IconPlus,
} from "@tabler/icons-react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import * as v from "valibot";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

type OutboundIntegrations = FunctionReturnType<
	typeof api.email.reader.listOutboundIntegrations
>;
type Inbox = FunctionReturnType<typeof api.email.reader.listInboxes>[number];
type FieldName =
	| keyof v.InferInput<typeof emailInboxDetailsSchema>
	| "outboundAddress";
type FormState = {
	displayName: string;
	address: string;
	selectedIntegrationId: string;
	outboundPrefix: string;
	outboundDomain: string;
};
type EmailInboxDialogProps =
	| {
			mode: "create";
			outboundIntegrations: OutboundIntegrations;
	  }
	| {
			mode: "edit";
			inbox: Inbox;
			outboundIntegrations: OutboundIntegrations;
	  };

function providerLabel(provider: OutboundIntegrations[number]["provider"]) {
	return provider === "resend" ? "Resend" : provider;
}

function unavailableIntegrationLabel(
	integration: OutboundIntegrations[number],
) {
	return integration.outboundReadiness === "missing_scope"
		? "Full access required"
		: "Reconnect required";
}

function splitEmailAddress(address?: string) {
	if (!address) {
		return { prefix: "", domain: "" };
	}
	const separatorIndex = address.lastIndexOf("@");
	return separatorIndex > 0
		? {
				prefix: address.slice(0, separatorIndex),
				domain: address.slice(separatorIndex + 1),
			}
		: { prefix: address, domain: "" };
}

function getInitialForm(props: EmailInboxDialogProps): FormState {
	if (props.mode === "create") {
		const defaultIntegration = props.outboundIntegrations.find(
			(integration) => integration.outboundReadiness === "ready",
		);
		return {
			displayName: "",
			address: "",
			selectedIntegrationId: defaultIntegration?.integrationId ?? "none",
			outboundPrefix: "",
			outboundDomain: "",
		};
	}

	const outboundAddress = splitEmailAddress(
		props.inbox.outboundIntegration?.address,
	);
	return {
		displayName: props.inbox.displayName,
		address: props.inbox.address,
		selectedIntegrationId:
			props.inbox.outboundIntegration?.integrationId ?? "none",
		outboundPrefix: outboundAddress.prefix,
		outboundDomain: outboundAddress.domain,
	};
}

function EmailInboxDialog(props: EmailInboxDialogProps) {
	const createInbox = useMutation(api.email.inboxes.create);
	const updateInbox = useMutation(api.email.inboxes.update);
	const listVerifiedDomains = useAction(api.email.outboundDomains.listVerified);
	const [open, setOpen] = useState(false);
	const [createdAddress, setCreatedAddress] = useState<string>();
	const [form, setForm] = useState<FormState>(() => getInitialForm(props));
	const [verifiedDomains, setVerifiedDomains] = useState<string[]>([]);
	const [domainState, setDomainState] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [dirtyFields, setDirtyFields] = useState<Set<FieldName>>(new Set());
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isCreate = props.mode === "create";
	const outboundAddress =
		form.selectedIntegrationId === "none"
			? null
			: `${form.outboundPrefix}@${form.outboundDomain}`;

	const validation = useMemo(
		() => ({
			displayName: v.safeParse(emailInboxNameSchema, form.displayName),
			address: v.safeParse(emailInboxAddressSchema, form.address),
			form: v.safeParse(emailInboxDetailsSchema, form),
			outboundAddress:
				outboundAddress === null
					? null
					: v.safeParse(emailInboxAddressSchema, outboundAddress),
		}),
		[form, outboundAddress],
	);

	useEffect(() => {
		if (!open || form.selectedIntegrationId === "none") {
			setVerifiedDomains([]);
			setDomainState("idle");
			return;
		}

		let canceled = false;
		const integrationId = form.selectedIntegrationId as Id<"emailIntegrations">;
		setDomainState("loading");
		void listVerifiedDomains({ integrationId })
			.then((domains) => {
				if (canceled) {
					return;
				}
				setVerifiedDomains(domains);
				setDomainState("ready");
				setForm((current) => {
					if (
						current.selectedIntegrationId !== integrationId ||
						domains.includes(current.outboundDomain)
					) {
						return current;
					}
					return {
						...current,
						outboundDomain: domains[0] ?? "",
					};
				});
			})
			.catch(() => {
				if (!canceled) {
					setVerifiedDomains([]);
					setDomainState("error");
				}
			});

		return () => {
			canceled = true;
		};
	}, [form.selectedIntegrationId, listVerifiedDomains, open]);

	function reset() {
		setCreatedAddress(undefined);
		setForm(getInitialForm(props));
		setVerifiedDomains([]);
		setDomainState("idle");
		setDirtyFields(new Set());
		setSubmissionError(null);
		setIsSubmitting(false);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen) {
			reset();
		}
		setOpen(nextOpen);
	}

	function markFieldDirty(field: FieldName) {
		setDirtyFields((current) => new Set(current).add(field));
		setSubmissionError(null);
	}

	function updateFormField(
		field: keyof FormState,
		value: string,
		dirtyField: FieldName,
	) {
		setForm((current) => ({ ...current, [field]: value }));
		markFieldDirty(dirtyField);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setDirtyFields(new Set(["displayName", "address", "outboundAddress"]));
		if (
			!validation.form.success ||
			(validation.outboundAddress !== null &&
				!validation.outboundAddress.success)
		) {
			return;
		}

		setIsSubmitting(true);
		setSubmissionError(null);
		const outbound =
			form.selectedIntegrationId === "none"
				? null
				: {
						integrationId:
							form.selectedIntegrationId as Id<"emailIntegrations">,
						address: outboundAddress ?? "",
					};
		try {
			if (props.mode === "create") {
				await createInbox({
					...validation.form.output,
					outbound,
				});
				setCreatedAddress(validation.form.output.address);
			} else {
				await updateInbox({
					inboxId: props.inbox._id,
					...validation.form.output,
					outbound,
				});
				setOpen(false);
			}
		} catch (error) {
			setSubmissionError(
				getConvexErrorMessage(
					error,
					isCreate
						? "The inbox could not be created."
						: "The inbox could not be updated.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	function fieldIsInvalid(field: FieldName) {
		const result = validation[field];
		return dirtyFields.has(field) && result !== null && !result.success;
	}

	const formId =
		props.mode === "create"
			? "add-email-inbox"
			: `edit-email-inbox-${props.inbox._id}`;
	const integrationItems = [
		{ value: "none", label: "No outbound integration" },
		...props.outboundIntegrations.map((integration) => ({
			value: integration.integrationId,
			label:
				integration.outboundReadiness === "ready"
					? providerLabel(integration.provider)
					: `${providerLabel(integration.provider)} · ${unavailableIntegrationLabel(integration)}`,
		})),
	];
	const domainItems = verifiedDomains.map((domain) => ({
		value: domain,
		label: domain,
	}));

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger
				render={
					isCreate ? (
						<Button />
					) : (
						<Button
							variant="ghost"
							size="icon-sm"
							className="text-muted-foreground"
							aria-label={`Edit ${props.inbox.displayName}`}
						/>
					)
				}
			>
				{isCreate ? <IconPlus /> : <IconPencil />}
				{isCreate && "Add inbox"}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				{createdAddress ? (
					<div className="flex flex-col items-center px-4 py-8 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
							<IconCheck className="size-6" />
						</div>
						<DialogHeader className="mt-5 items-center">
							<DialogTitle>Inbox created</DialogTitle>
							<DialogDescription>{createdAddress}</DialogDescription>
						</DialogHeader>
						<DialogClose render={<Button className="mt-6" />}>Done</DialogClose>
					</div>
				) : (
					<>
						<DialogHeader>
							<div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
								<IconInbox className="size-5" />
							</div>
							<DialogTitle>{isCreate ? "Add inbox" : "Edit inbox"}</DialogTitle>
							<DialogDescription>
								{isCreate
									? "Create a destination for incoming email."
									: "Update email routing and outbound delivery."}
							</DialogDescription>
						</DialogHeader>

						<form id={formId} onSubmit={submit} noValidate>
							<FieldGroup>
								<Field
									data-invalid={fieldIsInvalid("displayName") || undefined}
								>
									<FieldLabel htmlFor={`${formId}-name`}>Inbox name</FieldLabel>
									<Input
										id={`${formId}-name`}
										value={form.displayName}
										placeholder="Support"
										onChange={(event) =>
											updateFormField(
												"displayName",
												event.target.value,
												"displayName",
											)
										}
										aria-invalid={fieldIsInvalid("displayName") || undefined}
										autoComplete="off"
										autoFocus
									/>
									{fieldIsInvalid("displayName") && (
										<FieldError>
											{validation.displayName.issues?.[0]?.message}
										</FieldError>
									)}
								</Field>

								<Field data-invalid={fieldIsInvalid("address") || undefined}>
									<FieldLabel htmlFor={`${formId}-address`}>
										Inbound address
									</FieldLabel>
									<Input
										id={`${formId}-address`}
										type="email"
										placeholder="support@your-domain.com"
										value={form.address}
										onChange={(event) =>
											updateFormField("address", event.target.value, "address")
										}
										aria-invalid={fieldIsInvalid("address") || undefined}
										autoComplete="email"
									/>
									<FieldDescription>
										Incoming email to this address is sent to this inbox.
									</FieldDescription>
									{fieldIsInvalid("address") && (
										<FieldError>
											{validation.address.issues?.[0]?.message}
										</FieldError>
									)}
								</Field>

								<Field
									data-invalid={fieldIsInvalid("outboundAddress") || undefined}
								>
									<FieldLabel htmlFor={`${formId}-outbound-integration`}>
										Outbound integration and address
									</FieldLabel>
									<div className="flex flex-col gap-2">
										<Select
											items={integrationItems}
											value={form.selectedIntegrationId}
											onValueChange={(value) => {
												if (value !== null) {
													setForm((current) => ({
														...current,
														selectedIntegrationId: value,
														outboundDomain:
															value === current.selectedIntegrationId
																? current.outboundDomain
																: "",
													}));
													markFieldDirty("outboundAddress");
												}
											}}
										>
											<SelectTrigger
												id={`${formId}-outbound-integration`}
												className="w-full"
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">
													No outbound integration
												</SelectItem>
												{props.outboundIntegrations.map((integration) => (
													<SelectItem
														key={integration.integrationId}
														value={integration.integrationId}
														disabled={integration.outboundReadiness !== "ready"}
													>
														<span>{providerLabel(integration.provider)}</span>
														{integration.outboundReadiness !== "ready" && (
															<span className="text-xs text-muted-foreground">
																{unavailableIntegrationLabel(integration)}
															</span>
														)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										{form.selectedIntegrationId !== "none" && (
											<InputGroup>
												<InputGroupInput
													id={`${formId}-outbound-prefix`}
													value={form.outboundPrefix}
													placeholder="support"
													onChange={(event) =>
														updateFormField(
															"outboundPrefix",
															event.target.value,
															"outboundAddress",
														)
													}
													aria-invalid={
														fieldIsInvalid("outboundAddress") || undefined
													}
													autoComplete="off"
												/>
												<InputGroupAddon
													align="inline-end"
													className="min-w-0 flex-1 border-l border-input"
												>
													<InputGroupText className="pl-3">@</InputGroupText>
													<Select
														items={domainItems}
														value={form.outboundDomain || null}
														onValueChange={(value) => {
															if (value !== null) {
																updateFormField(
																	"outboundDomain",
																	value,
																	"outboundAddress",
																);
															}
														}}
														disabled={
															domainState !== "ready" ||
															verifiedDomains.length === 0
														}
													>
														<SelectTrigger
															id={`${formId}-outbound-domain`}
															data-slot="input-group-control"
															className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 focus-visible:ring-0 dark:bg-transparent"
															aria-invalid={
																fieldIsInvalid("outboundAddress") || undefined
															}
														>
															<SelectValue
																placeholder={
																	domainState === "loading"
																		? "Loading domains…"
																		: "Select domain"
																}
															/>
														</SelectTrigger>
														<SelectContent>
															{domainItems.map((domain) => (
																<SelectItem
																	key={domain.value}
																	value={domain.value}
																>
																	{domain.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</InputGroupAddon>
											</InputGroup>
										)}
									</div>
									<FieldDescription>
										Replies from this inbox use this connection and sender
										address.
									</FieldDescription>
									{domainState === "ready" &&
										form.selectedIntegrationId !== "none" &&
										verifiedDomains.length === 0 && (
											<FieldError>
												This Resend account has no verified domains.
											</FieldError>
										)}
									{domainState === "error" && (
										<FieldError>
											The verified domains could not be loaded.
										</FieldError>
									)}
									{fieldIsInvalid("outboundAddress") && (
										<FieldError>
											{validation.outboundAddress?.issues?.[0]?.message}
										</FieldError>
									)}
								</Field>
							</FieldGroup>

							{submissionError && (
								<p className="mt-4 text-sm text-destructive">
									{submissionError}
								</p>
							)}
						</form>

						<DialogFooter>
							<DialogClose
								render={<Button variant="ghost" disabled={isSubmitting} />}
							>
								Cancel
							</DialogClose>
							<Button type="submit" form={formId} disabled={isSubmitting}>
								{isSubmitting ? (
									<IconLoader2 className="animate-spin" />
								) : isCreate ? (
									<IconPlus />
								) : (
									<IconCheck />
								)}
								{isCreate ? "Add inbox" : "Save changes"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function AddEmailInboxDialog({
	outboundIntegrations,
}: {
	outboundIntegrations: OutboundIntegrations;
}) {
	return (
		<EmailInboxDialog
			mode="create"
			outboundIntegrations={outboundIntegrations}
		/>
	);
}

export function EditEmailInboxDialog({
	inbox,
	outboundIntegrations,
}: {
	inbox: Inbox;
	outboundIntegrations: OutboundIntegrations;
}) {
	return (
		<EmailInboxDialog
			mode="edit"
			inbox={inbox}
			outboundIntegrations={outboundIntegrations}
		/>
	);
}
