import { IconCircleCheckFilled } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { AddEmailConnectionDialog } from "#/components/email/add-email-connection-dialog.tsx";
import { ProviderMark } from "#/components/email/provider-mark.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import { api } from "../../../../convex/_generated/api";

const ORGANIZATION_SLUG = "merimoar";

export const Route = createFileRoute("/settings/organization/email")({
	component: OrganizationEmailSettings,
});

function OrganizationEmailSettings() {
	const workspace = useQuery(api.email.reader.getWorkspace, {
		organizationSlug: ORGANIZATION_SLUG,
	});
	const connections =
		workspace?.connections.filter(
			(connection) => connection.status === "active",
		) ?? [];

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
					<AddEmailConnectionDialog organizationSlug={ORGANIZATION_SLUG} />
				</div>

				<div className="space-y-3">
					{workspace === undefined && (
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

					{workspace !== undefined && connections.length === 0 && (
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

					{connections.map((connection) => (
						<Card key={connection._id}>
							<CardHeader>
								<div className="flex items-center gap-4">
									<div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background">
										<ProviderMark provider={connection.provider} />
									</div>
									<div className="min-w-0">
										<CardTitle className="truncate">
											{connection.displayName}
										</CardTitle>
										<CardDescription className="mt-1 truncate">
											{connection.address}
										</CardDescription>
									</div>
								</div>
								<CardAction>
									<Badge variant="secondary" className="gap-1.5">
										<IconCircleCheckFilled className="text-emerald-600" />
										Active
									</Badge>
								</CardAction>
							</CardHeader>
							<CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
								<span className="capitalize">{connection.provider}</span>
								<span aria-hidden="true">·</span>
								<span>Inbound email</span>
							</CardContent>
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
