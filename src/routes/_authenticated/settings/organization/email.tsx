import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useQueries, useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { AddEmailConnectionDialog } from "#/components/email/add-email-connection-dialog.tsx";
import { ProviderMark } from "#/components/email/provider-mark.tsx";
import { RemoveEmailConnectionDialog } from "#/components/email/remove-email-connection-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { showAppNotification } from "#/lib/app-notifications.ts";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const preloadEmailConnections = createServerFn({ method: "GET" }).handler(
	async () => {
		const client = await createAuthenticatedConvexHttpClient();
		return await client.query(api.email.reader.listConnections, {});
	},
);

export const Route = createFileRoute(
	"/_authenticated/settings/organization/email",
)({
	loader: () => preloadEmailConnections(),
	component: OrganizationEmailSettings,
});

function OrganizationEmailSettings() {
	const prefetchedConnections = Route.useLoaderData();
	const liveConnections = useQuery(api.email.reader.listConnections, {});
	const connections = liveConnections ?? prefetchedConnections;
	const activeConnections = connections.filter(
		(connection) => connection.status === "active",
	);

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
										<TooltipTrigger
											render={
												<button
													type="button"
													className="flex size-12 shrink-0 cursor-default items-center justify-center rounded-full bg-muted"
													aria-label="Provider: Resend"
												/>
											}
										>
											<ProviderMark provider={connection.provider} />
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

				<FailedIngestEvents connections={connections} />
			</div>
		</ScrollContainer>
	);
}

type FailedIngestEvent = FunctionReturnType<
	typeof api.email.ingestOperations.listFailedEvents
>[number];

function FailedIngestEvents({
	connections,
}: {
	connections: FunctionReturnType<typeof api.email.reader.listConnections>;
}) {
	const failureQueries = Object.fromEntries(
		connections.map((connection) => [
			connection._id,
			{
				query: api.email.ingestOperations.listFailedEvents,
				args: { connectionId: connection._id },
			},
		]),
	);
	const failureResults = useQueries(failureQueries);
	const failures = Object.values(failureResults).flatMap((result) =>
		result === undefined || result instanceof Error
			? []
			: (result as FailedIngestEvent[]),
	);
	const replayFailedEvent = useMutation(
		api.email.ingestOperations.replayFailedEvent,
	);
	const [replayingEventId, setReplayingEventId] =
		useState<Id<"emailIngestEvents">>();

	async function replay(
		eventId: Id<"emailIngestEvents">,
		connectionId: Id<"emailConnections">,
	) {
		setReplayingEventId(eventId);
		try {
			const result = await replayFailedEvent({ connectionId, eventId });
			showAppNotification({
				title:
					result.status === "queued"
						? "Email queued"
						: result.status === "already_processed"
							? "Email already processed"
							: "Email is already being processed",
			});
		} catch (error) {
			showAppNotification({
				title: "Email could not be retried",
				description: getConvexErrorMessage(
					error,
					"Try again after checking the connection.",
				),
			});
		} finally {
			setReplayingEventId(undefined);
		}
	}

	if (failures.length === 0) {
		return null;
	}

	return (
		<section className="mt-10">
			<div className="mb-4">
				<h2 className="text-lg font-semibold">Failed email ingest</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Retry email that could not be routed or processed.
				</p>
			</div>
			<div className="space-y-3">
				{failures.map((failure) => (
					<Card key={`${failure.connectionId}:${failure.eventId}`} size="sm">
						<CardHeader className="items-center">
							<div className="min-w-0">
								<CardTitle className="truncate">
									{failure.connection.displayName}
								</CardTitle>
								<CardDescription className="mt-1 truncate">
									{failure.connection.address}
								</CardDescription>
							</div>
							<CardAction>
								<Badge variant="outline">
									{failure.status === "unroutable" ? "Unroutable" : "Failed"}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardContent className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
							<div>
								<p>{failure.reason}</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{new Date(failure.receivedAt).toLocaleString()} ·{" "}
									{failure.attempts}{" "}
									{failure.attempts === 1 ? "attempt" : "attempts"}
								</p>
							</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={!failure.canReplay || replayingEventId !== undefined}
								onClick={() => replay(failure.eventId, failure.connectionId)}
							>
								{replayingEventId === failure.eventId ? "Retrying…" : "Retry"}
							</Button>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}

function ScrollContainer({ children }: { children: React.ReactNode }) {
	return <div className="h-full overflow-y-auto">{children}</div>;
}
