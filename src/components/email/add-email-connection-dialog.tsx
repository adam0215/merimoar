import {
	IconArrowLeft,
	IconArrowRight,
	IconCheck,
	IconLoader2,
	IconPlus,
} from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
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
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import { ProviderMark } from "./provider-mark.tsx";

const integrations = [
	{
		id: "resend",
		name: "Resend",
		description: "Receive email through a Resend-managed or custom domain.",
	},
] as const;

const displayNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(2, "Use at least 2 characters."),
	v.maxLength(80, "Use no more than 80 characters."),
);

const addressSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty("Enter the receiving address."),
	v.email("Enter a valid email address."),
);

const connectionSchema = v.object({
	displayName: displayNameSchema,
	address: addressSchema,
});

type WizardStep = "provider" | "details" | "review" | "success";
type FieldName = keyof v.InferInput<typeof connectionSchema>;

const initialForm = {
	displayName: "Development inbox",
	address: "",
};

export function AddEmailConnectionDialog({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const createConnection = useMutation(api.email.connections.create);
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<WizardStep>("provider");
	const [provider, setProvider] = useState<"resend" | null>(null);
	const [form, setForm] = useState(initialForm);
	const [dirtyFields, setDirtyFields] = useState<Set<FieldName>>(new Set());
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validation = useMemo(
		() => ({
			displayName: v.safeParse(displayNameSchema, form.displayName),
			address: v.safeParse(addressSchema, form.address),
			form: v.safeParse(connectionSchema, form),
		}),
		[form],
	);

	function reset() {
		setStep("provider");
		setProvider(null);
		setForm(initialForm);
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

	function chooseProvider() {
		setProvider("resend");
		setStep("details");
	}

	function updateField(field: FieldName, value: string) {
		setForm((current) => ({ ...current, [field]: value }));
		setDirtyFields((current) => new Set(current).add(field));
		setSubmissionError(null);
	}

	function showReview() {
		setDirtyFields(new Set(["displayName", "address"]));
		if (!validation.form.success) {
			return;
		}

		setForm(validation.form.output);
		setStep("review");
	}

	function handleDetailsSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		showReview();
	}

	function handleDetailsKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
		if (event.key === "Enter") {
			event.preventDefault();
			showReview();
		}
	}

	async function submit() {
		if (!provider || !validation.form.success) {
			setStep("details");
			return;
		}

		setIsSubmitting(true);
		setSubmissionError(null);

		try {
			await createConnection({
				organizationSlug,
				provider,
				displayName: validation.form.output.displayName,
				address: validation.form.output.address,
			});
			setStep("success");
		} catch (error) {
			setSubmissionError(
				getConvexErrorMessage(
					error,
					"The connection could not be created. Try again.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	function fieldIsInvalid(field: FieldName) {
		return dirtyFields.has(field) && !validation[field].success;
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button>
					<IconPlus />
					Add connection
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				{step !== "success" && (
					<>
						<DialogHeader>
							<DialogTitle>
								{step === "provider" && "Choose an integration"}
								{step === "details" && "Configure Resend"}
								{step === "review" && "Review connection"}
							</DialogTitle>
							<DialogDescription>
								{step === "provider" &&
									"Select how this organization receives email."}
								{step === "details" &&
									"Add the address Resend receives email for."}
								{step === "review" &&
									"Confirm the details before activating the connection."}
							</DialogDescription>
						</DialogHeader>
						<StepIndicator step={step} />
					</>
				)}

				{step === "provider" && (
					<div className="py-2">
						{integrations.map((integration) => (
							<button
								key={integration.id}
								type="button"
								onClick={chooseProvider}
								className="group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							>
								<span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
									<ProviderMark provider={integration.id} />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block font-medium">{integration.name}</span>
									<span className="mt-1 block text-sm leading-5 text-muted-foreground">
										{integration.description}
									</span>
								</span>
								<IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
							</button>
						))}
					</div>
				)}

				{step === "details" && (
					<form
						id="resend-connection-details"
						onSubmit={handleDetailsSubmit}
						onKeyDown={handleDetailsKeyDown}
						noValidate
					>
						<FieldGroup className="py-2">
							<Field data-invalid={fieldIsInvalid("displayName") || undefined}>
								<FieldLabel htmlFor="connection-display-name">
									Connection name
								</FieldLabel>
								<Input
									id="connection-display-name"
									value={form.displayName}
									onChange={(event) =>
										updateField("displayName", event.target.value)
									}
									aria-invalid={fieldIsInvalid("displayName") || undefined}
									autoComplete="off"
								/>
								<FieldDescription>
									A recognizable name for your team.
								</FieldDescription>
								{fieldIsInvalid("displayName") && (
									<FieldError>
										{validation.displayName.issues?.[0]?.message}
									</FieldError>
								)}
							</Field>

							<Field data-invalid={fieldIsInvalid("address") || undefined}>
								<FieldLabel htmlFor="connection-address">
									Receiving address
								</FieldLabel>
								<Input
									id="connection-address"
									type="email"
									placeholder="development@example.resend.app"
									value={form.address}
									onChange={(event) =>
										updateField("address", event.target.value)
									}
									aria-invalid={fieldIsInvalid("address") || undefined}
									autoComplete="email"
								/>
								<FieldDescription>
									Use the address shown in Resend Receiving.
								</FieldDescription>
								{fieldIsInvalid("address") && (
									<FieldError>
										{validation.address.issues?.[0]?.message}
									</FieldError>
								)}
							</Field>
						</FieldGroup>
					</form>
				)}

				{step === "review" && provider && validation.form.success && (
					<div className="space-y-4 py-2">
						<div className="flex items-center gap-4 rounded-2xl border bg-muted/30 p-4">
							<span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
								<ProviderMark provider={provider} />
							</span>
							<div>
								<p className="font-medium">Resend</p>
								<p className="text-sm text-muted-foreground">Inbound email</p>
							</div>
						</div>

						<dl className="divide-y rounded-2xl border px-4">
							<ReviewRow
								label="Connection name"
								value={validation.form.output.displayName}
							/>
							<ReviewRow
								label="Receiving address"
								value={validation.form.output.address}
							/>
							<ReviewRow label="Status" value="Active immediately" />
						</dl>

						{submissionError && (
							<p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{submissionError}
							</p>
						)}
					</div>
				)}

				{step === "success" && (
					<div className="flex flex-col items-center px-4 py-8 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
							<IconCheck className="size-6" />
						</div>
						<DialogHeader className="mt-5 items-center">
							<DialogTitle>Connection active</DialogTitle>
							<DialogDescription className="max-w-sm">
								New email sent to {form.address} will now appear in the shared
								inbox.
							</DialogDescription>
						</DialogHeader>
						<DialogClose asChild>
							<Button className="mt-6">Done</Button>
						</DialogClose>
					</div>
				)}

				{step !== "success" && (
					<DialogFooter className="gap-2 sm:justify-between">
						{step === "provider" ? (
							<DialogClose asChild>
								<Button variant="ghost">Cancel</Button>
							</DialogClose>
						) : (
							<Button
								variant="ghost"
								onClick={() =>
									setStep(step === "details" ? "provider" : "details")
								}
								disabled={isSubmitting}
							>
								<IconArrowLeft />
								Back
							</Button>
						)}

						{step === "details" && (
							<Button type="submit" form="resend-connection-details">
								Review
								<IconArrowRight />
							</Button>
						)}
						{step === "review" && (
							<Button onClick={submit} disabled={isSubmitting}>
								{isSubmitting ? (
									<IconLoader2 className="animate-spin" />
								) : (
									<IconCheck />
								)}
								Activate connection
							</Button>
						)}
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}

function StepIndicator({ step }: { step: Exclude<WizardStep, "success"> }) {
	const currentIndex = ["provider", "details", "review"].indexOf(step);

	return (
		<div
			className="flex items-center gap-2"
			role="progressbar"
			aria-label="Connection setup progress"
			aria-valuemin={1}
			aria-valuemax={3}
			aria-valuenow={currentIndex + 1}
		>
			{["Integration", "Details", "Review"].map((label, index) => (
				<div key={label} className="flex flex-1 items-center gap-2">
					<span
						className={cn(
							"h-1.5 flex-1 rounded-full bg-muted",
							index <= currentIndex && "bg-accent",
						)}
					/>
					<span className="sr-only">
						{index + 1}. {label}
					</span>
				</div>
			))}
		</div>
	);
}

function ReviewRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words text-sm font-medium sm:text-right">
				{value}
			</dd>
		</div>
	);
}
