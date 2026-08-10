import { api } from "@merimoar/convex/api";
import {
	IconMail,
	IconPencil,
	IconPlugConnected,
	IconPlus,
	IconRoute,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { borderedSurfaceClassName } from "#/components/ui/field-surface.ts";
import { Switch } from "#/components/ui/switch.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/components/ui/tabs.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { cn } from "#/lib/utils.ts";
import { CustomIntegrationDialog } from "./custom-integration-dialog.tsx";
import {
	type CustomIntegrationConfiguration,
	type CustomToolConfiguration,
	CustomToolDialog,
} from "./custom-tool-dialog.tsx";

type ConfigurationDialog =
	| {
			kind: "integration";
			integration?: CustomIntegrationConfiguration;
	  }
	| { kind: "tool"; tool?: CustomToolConfiguration };

export function AgentToolsPage() {
	const configuration = useQuery(
		api.agent.customTools.listWorkspaceConfiguration,
		{},
	) as CustomIntegrationConfiguration[] | undefined;
	const integrations = configuration ?? [];
	const builtInConfiguration = useQuery(
		api.agent.builtInTools.getWorkspaceConfiguration,
		{},
	);
	const setEmailSendingActive = useMutation(
		api.agent.builtInTools.setEmailSendingActive,
	);
	const [dialog, setDialog] = useState<ConfigurationDialog>();
	const [isSavingEmailSetting, setIsSavingEmailSetting] = useState(false);

	async function updateEmailSending(active: boolean) {
		setIsSavingEmailSetting(true);
		try {
			await setEmailSendingActive({ active });
		} catch (error) {
			toast.add({
				title: "Could not update email sending",
				description: getConvexErrorMessage(error),
				type: "error",
			});
		} finally {
			setIsSavingEmailSetting(false);
		}
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="w-full space-y-6 p-6">
				<h1 className="text-2xl font-semibold tracking-tight">Tools</h1>
				<Tabs defaultValue="tools" className="gap-6">
					<TabsList variant="divider-line" aria-label="Tool configuration">
						<TabsTrigger value="tools">Tools</TabsTrigger>
						<TabsTrigger value="integrations">Integrations</TabsTrigger>
					</TabsList>
					<TabsContent value="tools">
						<div className="space-y-8">
							<section aria-labelledby="built-in-tools-heading">
								<h2 id="built-in-tools-heading" className="font-semibold">
									Built-in tools
								</h2>
								<article
									className={cn(
										"mt-3 flex items-center gap-4 rounded-xl p-4",
										borderedSurfaceClassName,
									)}
								>
									<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
										<IconMail className="size-5" />
									</div>
									<div className="min-w-0 flex-1">
										<label
											htmlFor="agent-email-sending"
											className="text-sm font-medium"
										>
											Send email
										</label>
										<p className="mt-1 text-sm text-muted-foreground">
											Allow the agent to propose replies in case-related email
											threads. Every email requires approval.
										</p>
									</div>
									<Switch
										id="agent-email-sending"
										aria-label="Allow the agent to send email"
										checked={builtInConfiguration?.emailSendingActive ?? false}
										disabled={
											builtInConfiguration === undefined || isSavingEmailSetting
										}
										onCheckedChange={(checked) =>
											void updateEmailSending(checked)
										}
									/>
								</article>
							</section>
							<section aria-labelledby="custom-tools-heading">
								<div className="flex items-center justify-between gap-3">
									<h2 id="custom-tools-heading" className="font-semibold">
										Custom tools
									</h2>
									<Button size="sm" onClick={() => setDialog({ kind: "tool" })}>
										<IconPlus /> Add custom tool
									</Button>
								</div>
								<CustomToolList
									integrations={integrations}
									loading={configuration === undefined}
									onEdit={(tool) => {
										setDialog({ kind: "tool", tool });
									}}
								/>
							</section>
						</div>
					</TabsContent>
					<TabsContent value="integrations">
						<section aria-labelledby="custom-integrations-heading">
							<div className="flex items-center justify-between gap-3">
								<h2 id="custom-integrations-heading" className="font-semibold">
									Custom integrations
								</h2>
								<Button
									size="sm"
									onClick={() => setDialog({ kind: "integration" })}
								>
									<IconPlus /> Add integration
								</Button>
							</div>
							<IntegrationList
								integrations={integrations}
								loading={configuration === undefined}
								onEdit={(integration) => {
									setDialog({ kind: "integration", integration });
								}}
							/>
						</section>
					</TabsContent>
				</Tabs>
			</div>

			{dialog?.kind === "integration" && (
				<CustomIntegrationDialog
					integration={dialog.integration}
					onClose={() => setDialog(undefined)}
					onSaved={() => setDialog(undefined)}
				/>
			)}
			{dialog?.kind === "tool" && (
				<CustomToolDialog
					tool={dialog.tool}
					integrations={integrations}
					onClose={() => setDialog(undefined)}
				/>
			)}
		</div>
	);
}

function CustomToolList({
	integrations,
	loading,
	onEdit,
}: {
	integrations: CustomIntegrationConfiguration[];
	loading: boolean;
	onEdit(tool: CustomToolConfiguration): void;
}) {
	const tools = integrations.flatMap((integration) =>
		integration.tools.map((tool) => ({ integration, tool })),
	);
	if (loading || tools.length === 0) {
		return (
			<p className="px-4 py-12 text-center text-sm text-muted-foreground">
				{loading ? "Loading tools…" : "No custom tools"}
			</p>
		);
	}
	return (
		<div className="mt-3 grid gap-2 sm:grid-cols-2">
			{tools.map(({ integration, tool }) => (
				<article
					key={tool._id}
					className={cn("rounded-xl p-4", borderedSurfaceClassName)}
				>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex min-w-0 items-center gap-2">
								<p className="truncate text-sm font-medium">{tool.name}</p>
								{tool.requiresApproval && (
									<Badge variant="secondary">Requires approval</Badge>
								)}
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Edit ${tool.name}`}
							onClick={() => onEdit(tool)}
						>
							<IconPencil />
						</Button>
					</div>
					<p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
						{tool.description}
					</p>
					<div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
						<span className="flex min-w-0 items-center gap-1.5">
							<IconPlugConnected className="size-4 shrink-0" />
							<span className="truncate">{integration.name}</span>
						</span>
						<span className="flex min-w-0 items-center gap-1.5">
							<IconRoute className="size-4 shrink-0" />
							<span className="truncate font-mono">
								/{tool.path.replace(/^\/+/, "")}
							</span>
						</span>
						{tool.needsRetest && (
							<Badge variant="destructive">Test required</Badge>
						)}
					</div>
				</article>
			))}
		</div>
	);
}

function IntegrationList({
	integrations,
	loading,
	onEdit,
}: {
	integrations: CustomIntegrationConfiguration[];
	loading: boolean;
	onEdit(integration: CustomIntegrationConfiguration): void;
}) {
	if (loading || integrations.length === 0) {
		return (
			<p className="px-4 py-12 text-center text-sm text-muted-foreground">
				{loading ? "Loading integrations…" : "No custom integrations"}
			</p>
		);
	}
	return (
		<div className="mt-3 space-y-2">
			{integrations.map((integration) => {
				const retestCount = integration.tools.filter(
					(tool) => tool.needsRetest,
				).length;
				return (
					<article
						key={integration._id}
						className={cn("rounded-xl p-4", borderedSurfaceClassName)}
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="text-sm font-medium">{integration.name}</p>
								<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
									{integration.baseUrl}
								</p>
							</div>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Edit ${integration.name}`}
								onClick={() => onEdit(integration)}
							>
								<IconPencil />
							</Button>
						</div>
						<div className="mt-6 flex flex-wrap gap-2">
							<Badge variant="outline">
								{integration.tools.length}{" "}
								{integration.tools.length === 1 ? "tool" : "tools"}
							</Badge>
							{retestCount > 0 && (
								<Badge variant="destructive">
									{retestCount}{" "}
									{retestCount === 1 ? "tool needs" : "tools need"} testing
								</Badge>
							)}
						</div>
					</article>
				);
			})}
		</div>
	);
}
