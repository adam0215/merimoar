import { api } from "@merimoar/convex/api";
import type { Doc, Id } from "@merimoar/convex/data-model";
import { IconTrash } from "@tabler/icons-react";
import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { DeleteConfirmationDialog } from "#/components/ui/delete-confirmation-dialog.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function CustomIntegrationDialog({
	integration,
	onClose,
	onSaved,
}: {
	integration?: Doc<"customIntegrations"> & {
		tools: readonly Doc<"agentCustomTools">[];
	};
	onClose(): void;
	onSaved(integrationId: Id<"customIntegrations">): void;
}) {
	const createIntegration = useMutation(
		api.agent.customTools.createIntegration,
	);
	const updateIntegration = useMutation(
		api.agent.customTools.updateIntegration,
	);
	const deleteIntegration = useMutation(
		api.agent.customTools.deleteIntegration,
	);
	const [name, setName] = useState(integration?.name ?? "");
	const [baseUrl, setBaseUrl] = useState(integration?.baseUrl ?? "");
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
	const busy = saving || deleting;
	const deleteDescription = integration?.tools.length
		? `This permanently deletes the integration and its ${integration.tools.length} custom ${integration.tools.length === 1 ? "tool" : "tools"}. Existing task history is kept.`
		: "This permanently deletes the integration. Existing task history is kept.";

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		try {
			let integrationId: Id<"customIntegrations">;
			if (integration) {
				await updateIntegration({
					integrationId: integration._id,
					name,
					baseUrl,
				});
				integrationId = integration._id;
			} else {
				integrationId = await createIntegration({ name, baseUrl });
			}
			onSaved(integrationId);
		} catch (error) {
			toast.add({
				title: integration
					? "Integration could not be updated"
					: "Integration could not be created",
				description: getConvexErrorMessage(
					error,
					"Check the values and try again.",
				),
				type: "error",
			});
		} finally {
			setSaving(false);
		}
	}

	async function confirmDelete() {
		if (!integration || busy) return;
		setDeleting(true);
		try {
			await deleteIntegration({ integrationId: integration._id });
			setDeleteConfirmationOpen(false);
			onClose();
		} catch (error) {
			toast.add({
				title: "Integration could not be deleted",
				description: getConvexErrorMessage(error, "Try again."),
				type: "error",
			});
		} finally {
			setDeleting(false);
		}
	}

	return (
		<>
			<Dialog open onOpenChange={(next) => !busy && !next && onClose()}>
				<DialogContent>
					<form onSubmit={submit} className="contents">
						<DialogHeader>
							<DialogTitle>
								{integration ? "Edit integration" : "Add integration"}
							</DialogTitle>
							<DialogDescription>
								The base endpoint used for custom HTTP tools.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="custom-integration-name">Name</Label>
								<Input
									id="custom-integration-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="e.g. Temperature service"
									autoFocus
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="custom-integration-base-url">Base URL</Label>
								<Input
									id="custom-integration-base-url"
									value={baseUrl}
									onChange={(event) => setBaseUrl(event.target.value)}
									placeholder="e.g. https://api.example.com/v1"
									spellCheck={false}
								/>
							</div>
						</div>
						<DialogFooter>
							{integration && (
								<Button
									type="button"
									variant="destructive-subtle"
									className="sm:mr-auto"
									disabled={busy}
									onClick={() => setDeleteConfirmationOpen(true)}
								>
									<IconTrash /> Delete
								</Button>
							)}
							<Button
								type="button"
								variant="secondary"
								disabled={busy}
								onClick={onClose}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={busy || !name.trim() || !baseUrl.trim()}
							>
								{saving ? "Saving…" : "Save"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			{integration && (
				<DeleteConfirmationDialog
					open={deleteConfirmationOpen}
					onOpenChange={(open) => !deleting && setDeleteConfirmationOpen(open)}
					title={`Delete ${integration.name}?`}
					description={deleteDescription}
					actionLabel="Delete integration"
					isDeleting={deleting}
					onConfirm={() => void confirmDelete()}
				/>
			)}
		</>
	);
}
