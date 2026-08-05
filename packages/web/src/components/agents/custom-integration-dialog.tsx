import { api } from "@merimoar/convex/api";
import type { Doc, Id } from "@merimoar/convex/data-model";
import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
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
import { showAppNotification } from "#/lib/app-notifications.ts";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

export function CustomIntegrationDialog({
	integration,
	onClose,
	onSaved,
}: {
	integration?: Doc<"customIntegrations">;
	onClose(): void;
	onSaved(integrationId: Id<"customIntegrations">): void;
}) {
	const createIntegration = useMutation(
		api.agent.customTools.createIntegration,
	);
	const updateIntegration = useMutation(
		api.agent.customTools.updateIntegration,
	);
	const [name, setName] = useState(integration?.name ?? "");
	const [baseUrl, setBaseUrl] = useState(integration?.baseUrl ?? "");
	const [saving, setSaving] = useState(false);

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
			showAppNotification({
				title: integration
					? "Integration could not be updated"
					: "Integration could not be created",
				description: getConvexErrorMessage(
					error,
					"Check the values and try again.",
				),
			});
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open onOpenChange={(next) => !saving && !next && onClose()}>
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
						<Button
							type="button"
							variant="secondary"
							disabled={saving}
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={saving || !name.trim() || !baseUrl.trim()}
						>
							{saving ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
