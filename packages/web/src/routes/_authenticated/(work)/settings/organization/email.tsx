import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { IconInbox, IconMailbox, IconMailShare } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useQueries, useQuery } from "convex-helpers/react/cache";
import { useEffect, useState } from "react";
import {
	AddEmailInboxDialog,
	EditEmailInboxDialog,
} from "#/components/email/add-email-inbox-dialog.tsx";
import { RemoveEmailInboxDialog } from "#/components/email/remove-email-inbox-dialog.tsx";
import { ResendPipesConnection } from "#/components/email/resend-pipes-connection.tsx";
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
import { createAuthenticatedConvexHttpClient } from "#/integrations/convex/server.ts";
import { refreshResendPipesConnectionState } from "#/integrations/workos/resend-pipes-functions.ts";
import { showAppNotification } from "#/lib/app-notifications.ts";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";

const preloadEmailSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const client = await createAuthenticatedConvexHttpClient();
		const [inboxes, outboundIntegrations] = await Promise.all([
			client.query(api.email.reader.listInboxes, {}),
			client.query(api.email.reader.listOutboundIntegrations, {}),
		]);
		return { inboxes, outboundIntegrations };
	},
);

export const Route = createFileRoute(
	"/_authenticated/(work)/settings/organization/email",
)({
	loader: async () => {
		const [emailSettings, resendPipesConnectionState] = await Promise.all([
			preloadEmailSettings(),
			refreshResendPipesConnectionState(),
		]);
		return { ...emailSettings, resendPipesConnectionState };
	},
	component: OrganizationEmailSettings,
});

function OrganizationEmailSettings() {
	const {
		inboxes: prefetchedInboxes,
		outboundIntegrations: prefetchedOutboundIntegrations,
		resendPipesConnectionState: initialResendPipesConnectionState,
	} = Route.useLoaderData();
	const [resendPipesConnectionState, setResendPipesConnectionState] = useState(
		initialResendPipesConnectionState,
	);
	const liveInboxes = useQuery(api.email.reader.listInboxes, {});
	const liveOutboundIntegrations = useQuery(
		api.email.reader.listOutboundIntegrations,
		{},
	);
	const inboxes = liveInboxes ?? prefetchedInboxes;
	const outboundIntegrations =
		liveOutboundIntegrations ?? prefetchedOutboundIntegrations;

	useEffect(() => {
		let isDisposed = false;
		let isRefreshing = false;

		async function refreshConnectionStateWhileVisible() {
			if (document.visibilityState !== "visible" || isRefreshing) {
				return;
			}
			isRefreshing = true;
			try {
				const connectionState = await refreshResendPipesConnectionState();
				if (!isDisposed) {
					setResendPipesConnectionState(connectionState);
				}
			} catch (error) {
				console.error("Could not refresh the Resend connection state.", error);
			} finally {
				isRefreshing = false;
			}
		}

		function refreshConnectionStateWhenVisible() {
			if (document.visibilityState === "visible") {
				void refreshConnectionStateWhileVisible();
			}
		}

		window.addEventListener("focus", refreshConnectionStateWhenVisible);
		document.addEventListener(
			"visibilitychange",
			refreshConnectionStateWhenVisible,
		);
		return () => {
			isDisposed = true;
			window.removeEventListener("focus", refreshConnectionStateWhenVisible);
			document.removeEventListener(
				"visibilitychange",
				refreshConnectionStateWhenVisible,
			);
		};
	}, []);

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-4xl px-5 py-8 md:px-10 md:py-12">
				<div className="mb-10">
					<h1 className="text-2xl font-semibold tracking-tight">
						Email routing
					</h1>
					<p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
						Create inboxes and connect the services that deliver email to them.
					</p>
				</div>

				<section className="mb-10">
					<div className="mb-4">
						<h2 className="text-base font-medium">Email integrations</h2>
					</div>
					<ResendPipesConnection connectionState={resendPipesConnectionState} />
				</section>

				<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
					<h2 className="text-base font-medium">Inboxes</h2>
					<AddEmailInboxDialog outboundIntegrations={outboundIntegrations} />
				</div>
				<div className="space-y-3">
					{inboxes.length === 0 && (
						<Card className="border-dashed bg-muted/20">
							<CardHeader>
								<CardTitle>No inboxes</CardTitle>
								<CardDescription>
									Add an inbox name and email address.
								</CardDescription>
							</CardHeader>
						</Card>
					)}

					{inboxes.map((inbox) => (
						<Card key={inbox._id}>
							<CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center">
								<div className="flex min-w-0 items-center gap-4">
									<div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
										<IconInbox className="size-5" />
									</div>
									<div className="min-w-0">
										<CardTitle className="truncate">
											{inbox.displayName}
										</CardTitle>
										<div className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
											<CardDescription className="flex min-w-0 items-center gap-2">
												<IconMailbox className="size-4 shrink-0" />
												<span className="truncate">{inbox.address}</span>
											</CardDescription>
											<p className="flex min-w-0 items-center gap-2">
												<IconMailShare className="size-4 shrink-0" />
												<span className="truncate">
													{inbox.outboundIntegration
														? inbox.outboundIntegration.address
														: "No outbound"}
												</span>
											</p>
										</div>
									</div>
								</div>
								<CardAction className="flex flex-col items-end gap-2 self-center">
									<Badge variant="success">Active</Badge>
									<div className="flex items-center gap-1">
										<EditEmailInboxDialog
											inbox={inbox}
											outboundIntegrations={outboundIntegrations}
										/>
										<RemoveEmailInboxDialog
											inboxId={inbox._id}
											displayName={inbox.displayName}
											address={inbox.address}
										/>
									</div>
								</CardAction>
							</CardHeader>
						</Card>
					))}
				</div>

				<FailedIngestEvents inboxes={inboxes} />
			</div>
		</div>
	);
}

type FailedIngestEvent = FunctionReturnType<
	typeof api.email.ingestOperations.listFailedEvents
>[number];

function FailedIngestEvents({
	inboxes,
}: {
	inboxes: FunctionReturnType<typeof api.email.reader.listInboxes>;
}) {
	const failureQueries = Object.fromEntries(
		inboxes.map((inbox) => [
			inbox._id,
			{
				query: api.email.ingestOperations.listFailedEvents,
				args: { inboxId: inbox._id },
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
		inboxId: Id<"emailInboxes">,
	) {
		setReplayingEventId(eventId);
		try {
			const result = await replayFailedEvent({ inboxId, eventId });
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
					"Try again after checking the inbox and integration.",
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
					<Card key={`${failure.inboxId}:${failure.eventId}`} size="sm">
						<CardHeader className="items-center">
							<div className="min-w-0">
								<CardTitle className="truncate">
									{failure.inbox.displayName}
								</CardTitle>
								<CardDescription className="mt-1 truncate">
									{failure.inbox.address}
								</CardDescription>
							</div>
							<CardAction>
								<Badge
									variant={
										failure.status === "failed" ? "destructive" : "outline"
									}
								>
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
								onClick={() => replay(failure.eventId, failure.inboxId)}
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
