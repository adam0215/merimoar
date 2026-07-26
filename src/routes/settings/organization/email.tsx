import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { AddEmailConnectionDialog } from "#/components/email/add-email-connection-dialog.tsx";
import { ProviderMark } from "#/components/email/provider-mark.tsx";
import { RemoveEmailConnectionDialog } from "#/components/email/remove-email-connection-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/settings/organization/email")({
	component: OrganizationEmailSettings,
});

function OrganizationEmailSettings() {
	const connections = useQuery(api.email.reader.listConnections, {});
	const activeConnections =
		connections?.filter((connection) => connection.status === "active") ?? [];

	return (
		<ScrollContainer>
			<div className="mx-auto w-full max-w-4xl px-5 py-8 md:px-10 md:py-12">
				<div className="mb-8 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">
							Email connections
						</h1>
						<p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
							Connections receive email for your organization and make it
							available in the shared inbox.
						</p>
					</div>
					<AddEmailConnectionDialog />
				</div>

				<div className="space-y-3">
					{connections === undefined && (
						<Card>
							<CardHeader>
								<div className="flex items-center gap-4">
									<div className="size-12 animate-pulse rounded-xl bg-muted" />
									<div className="space-y-2">
										<div className="h-4 w-32 animate-pulse rounded bg-muted" />
										<div className="h-3 w-48 animate-pulse rounded bg-muted" />
									</div>
								</div>
							</CardHeader>
						</Card>
					)}

					{connections !== undefined && activeConnections.length === 0 && (
						<Card className="border-dashed bg-muted/20">
							<CardHeader>
								<CardTitle>No active connections</CardTitle>
								<CardDescription>
									Your organization does not have an active email connection
									yet.
								</CardDescription>
							</CardHeader>
						</Card>
					)}

					{activeConnections.map((connection) => (
						<Card key={connection._id}>
							<CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center">
								<div className="flex min-w-0 items-center gap-4">
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												className="flex size-12 shrink-0 cursor-default items-center justify-center rounded-full bg-muted"
												aria-label="Provider: Resend"
											>
												<ProviderMark provider={connection.provider} />
											</button>
										</TooltipTrigger>
										<TooltipContent side="top">Resend</TooltipContent>
									</Tooltip>
									<div className="min-w-0">
										<CardTitle className="truncate">
											{connection.displayName}
										</CardTitle>
										<CardDescription className="mt-1 truncate">
											{connection.address}
										</CardDescription>
									</div>
								</div>
								<CardAction className="flex items-center self-center gap-1">
									<Badge
										variant="outline"
										className="border-accent bg-accent/10 text-accent"
									>
										Active
									</Badge>
									<RemoveEmailConnectionDialog
										connectionId={connection._id}
										displayName={connection.displayName}
										address={connection.address}
									/>
								</CardAction>
							</CardHeader>
						</Card>
					))}
				</div>
			</div>
		</ScrollContainer>
	);
}

function ScrollContainer({ children }: { children: React.ReactNode }) {
	return <div className="h-full overflow-y-auto">{children}</div>;
}
