import { IconFolder } from "@tabler/icons-react";
import { CaseAgentPanel } from "#/components/agents/case-agent-panel.tsx";
import { CaseEmailThreads } from "#/components/case/case-email-threads.tsx";
import { CaseEvents } from "#/components/case/case-events.tsx";
import { CaseHeader } from "#/components/case/case-header.tsx";
import { CaseInteractionPolicyProvider } from "#/components/case/case-interaction-policy.tsx";
import { CaseRelationships } from "#/components/case/case-relationships.tsx";
import type { CaseCreateOptions, CaseDetail } from "#/components/case/types.ts";
import { Skeleton } from "#/components/ui/skeleton.tsx";

export function CaseView({
	detail,
	createOptions,
	closeButton,
	onCaseDeleted,
}: {
	detail: CaseDetail | null | undefined;
	createOptions: CaseCreateOptions | undefined;
	closeButton: React.ReactNode;
	onCaseDeleted: () => void;
}) {
	if (detail === undefined) {
		return <CaseViewSkeleton />;
	}

	if (detail === null) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-8 text-center">
				<IconFolder className="mb-4 size-6 text-muted-foreground/50" />
				<h2 className="font-medium">Case not found</h2>
				<p className="mt-1 max-w-72 text-sm text-muted-foreground">
					This case is unavailable in the current organization.
				</p>
			</div>
		);
	}

	return (
		<CaseInteractionPolicyProvider activeAgentTask={detail.activeAgentTask}>
			<div className="relative h-full">
				<div className="h-full overflow-y-auto overscroll-none">
					<div className="relative mx-auto w-full max-w-6xl p-6 pb-28">
						<div aria-readonly={detail.activeAgentTask ? true : undefined}>
							<CaseHeader
								detail={detail}
								members={createOptions?.members ?? []}
								closeButton={closeButton}
								onDeleted={onCaseDeleted}
							/>
							<CaseRelationships detail={detail} />
							<CaseEmailThreads detail={detail} />
							<CaseEvents caseId={detail.case._id} events={detail.events} />
						</div>
					</div>
				</div>
				<CaseAgentPanel
					caseId={detail.case._id}
					caseReference={detail.case.reference}
					activeAgentTask={detail.activeAgentTask}
					agentTasks={detail.agentTasks}
				/>
			</div>
		</CaseInteractionPolicyProvider>
	);
}

function CaseViewSkeleton() {
	return (
		<div className="mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-8">
			<Skeleton className="h-3 w-24" />
			<Skeleton className="mt-3 h-7 w-3/5" />
			<div className="mt-4 flex gap-3">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-4 w-24" />
			</div>
			<Skeleton className="mt-5 h-4 w-full max-w-2xl" />
			<Skeleton className="mt-2 h-4 w-4/5 max-w-xl" />
			<div className="mt-8 grid gap-2 sm:grid-cols-2">
				<Skeleton className="h-16 rounded-xl" />
				<Skeleton className="h-16 rounded-xl" />
			</div>
			<div className="mt-8 flex gap-2">
				<Skeleton className="h-9 w-36 rounded-full" />
				<Skeleton className="h-9 w-44 rounded-full" />
			</div>
		</div>
	);
}
