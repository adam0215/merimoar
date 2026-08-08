import { api } from "@merimoar/convex/api";
import type { Id } from "@merimoar/convex/data-model";
import { IconChevronDown, IconHistory, IconRobot } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AgentOrb } from "#/components/agents/agent-orb.tsx";
import { getTaskStatusLabel } from "#/components/agents/agent-status.tsx";
import { formatAgentTaskLabel } from "#/components/agents/agent-task-label.ts";
import type { AgentItemRecord } from "#/components/agents/agent-types.ts";
import defaultCaseDelegationPrompt from "#/components/agents/prompts/default-case-delegation.md" with {
	type: "text",
};
import { TakeOverTaskDialog } from "#/components/agents/take-over-task-dialog.tsx";
import { RecentTaskActivity } from "#/components/agents/task-activity.tsx";
import type {
	ActiveAgentTaskSummary,
	CaseAgentTaskSummary,
} from "#/components/case/types.ts";
import { Button } from "#/components/ui/button.tsx";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { getConvexErrorMessage } from "#/lib/convex-error.ts";
import { formatShortDate } from "#/lib/date-format.ts";
import { cn } from "#/lib/utils.ts";

const AGENT_PILL_LAYOUT_TRANSITION = {
	layout: {
		type: "spring",
		stiffness: 320,
		damping: 23,
		mass: 1.3,
	},
} as const;

export function CaseAgentPanel({
	caseId,
	caseReference,
	activeAgentTask,
	agentTasks,
}: {
	caseId: Id<"cases">;
	caseReference: string;
	activeAgentTask: ActiveAgentTaskSummary;
	agentTasks: CaseAgentTaskSummary[];
}) {
	return (
		<>
			{activeAgentTask && (
				<div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex min-w-0 justify-center sm:inset-x-20">
					<div className="pointer-events-auto flex w-full max-w-xl justify-center">
						<CaseTaskPill caseId={caseId} task={activeAgentTask} />
					</div>
				</div>
			)}
			<div className="pointer-events-none absolute inset-x-4 bottom-4 z-30 mx-auto flex max-w-6xl justify-end sm:inset-x-6">
				<div className="pointer-events-auto flex max-w-full items-end gap-2">
					{agentTasks.length > 0 && <CaseTaskMenu tasks={agentTasks} />}
					{!activeAgentTask && (
						<DelegateDialog caseId={caseId} caseReference={caseReference} />
					)}
				</div>
			</div>
		</>
	);
}

function CaseTaskMenu({ tasks }: { tasks: CaseAgentTaskSummary[] }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="secondary"
						size="icon-lg"
						className="size-11 rounded-full border shadow-lg"
						aria-label="Agent task history"
						title="Agent task history"
					/>
				}
			>
				<IconHistory />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="end"
				sideOffset={8}
				className="w-80 data-open:animate-in! data-closed:animate-out! motion-reduce:animate-none!"
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel className="font-medium text-sm text-foreground">
						Agent tasks
					</DropdownMenuLabel>
					{tasks.map((task) => (
						<DropdownMenuItem
							key={task.taskId}
							render={
								<Link
									to="/agents"
									search={{ view: "tasks", task: task.taskId }}
									title={task.taskId}
								/>
							}
							className="items-start"
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium">
									{formatAgentTaskLabel(task.taskId)}
								</span>
								<span className="block text-xs text-muted-foreground">
									{formatShortDate(task.requestedAt)}
								</span>
							</span>
							<span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
								{getTaskStatusLabel(task.status)}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function CaseTaskPill({
	caseId,
	task,
}: {
	caseId: Id<"cases">;
	task: NonNullable<ActiveAgentTaskSummary>;
}) {
	const [open, setOpen] = useState(false);
	const items = useQuery(api.agent.reader.listRecentItems, {
		taskId: task.taskId,
	});
	const latestItemId = items?.at(-1)?.itemId;

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="flex w-full justify-center"
		>
			<motion.div
				layout
				style={{ originX: 0.5, originY: 0.5, borderRadius: 32 }}
				transition={AGENT_PILL_LAYOUT_TRANSITION}
				className={cn(
					"shrink-0 overflow-hidden border bg-popover text-popover-foreground shadow-lg",
					open ? "w-full" : "w-[min(100%,24rem)]",
				)}
			>
				<motion.div
					layout
					transition={AGENT_PILL_LAYOUT_TRANSITION}
					className="flex min-w-0 items-center gap-1 p-1.5"
				>
					<Link
						to="/agents"
						search={{ view: "tasks", task: task.taskId }}
						className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-1 py-0.5 text-foreground no-underline outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
					>
						<AgentOrb pulseKey={latestItemId} />
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm font-semibold">
								{getTaskStatusLabel(task.status)}
							</span>
							<span className="hidden truncate text-xs text-muted-foreground sm:block">
								{getSummaryProgress(task)}
							</span>
						</span>
					</Link>

					<TakeOverTaskDialog caseId={caseId} variant="ghost" />
					<CollapsibleTrigger
						render={
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="shrink-0"
								aria-label="Agent history"
								title="Agent history"
							/>
						}
					>
						<IconChevronDown
							className={cn(
								"transition-transform duration-150 ease-out motion-reduce:transition-none",
								open && "rotate-180",
							)}
						/>
					</CollapsibleTrigger>
				</motion.div>
				<CollapsibleContent
					render={
						<motion.div layout transition={AGENT_PILL_LAYOUT_TRANSITION} />
					}
				>
					<div className="border-t px-4 pt-3 pb-4">
						<p className="mb-3 text-xs font-medium">Agent history</p>
						{open && <CaseTaskHistory items={items} />}
					</div>
				</CollapsibleContent>
			</motion.div>
		</Collapsible>
	);
}

function CaseTaskHistory({ items }: { items: AgentItemRecord[] | undefined }) {
	const scrollArea = useRef<HTMLDivElement>(null);
	const latestItemId = items?.at(-1)?.itemId;
	const shouldReduceMotion = useReducedMotion();

	useEffect(() => {
		const element = scrollArea.current;
		if (!element || !latestItemId) return;
		element.scrollTo({
			top: element.scrollHeight,
			behavior: shouldReduceMotion ? "auto" : "smooth",
		});
	}, [latestItemId, shouldReduceMotion]);

	if (items === undefined) {
		return <p className="text-xs text-muted-foreground">Loading activity…</p>;
	}
	return (
		<div
			ref={scrollArea}
			className="max-h-72 overflow-y-auto scroll-smooth pr-1 motion-reduce:scroll-auto sm:max-h-96"
		>
			<motion.div
				initial={
					shouldReduceMotion ? false : { opacity: 0, filter: "blur(3px)" }
				}
				animate={{ opacity: 1, filter: "blur(0px)" }}
				transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
			>
				<RecentTaskActivity items={items} animateItems />
			</motion.div>
		</div>
	);
}

function getSummaryProgress(task: NonNullable<ActiveAgentTaskSummary>) {
	if (task.status === "waiting") return task.reason;
	if (task.status === "waiting_for_approval") {
		return `${task.pendingApprovalCount} ${
			task.pendingApprovalCount === 1 ? "approval" : "approvals"
		} pending`;
	}
	return (
		task.activity?.detail ??
		task.activity?.title ??
		(task.runStatus === "queued" ? "Queued" : "Working")
	);
}

function DelegateDialog({
	caseId,
	caseReference,
}: {
	caseId: Id<"cases">;
	caseReference: string;
}) {
	const delegateCase = useMutation(api.agent.tasks.delegateCase);
	const [open, setOpen] = useState(false);
	const [showInstruction, setShowInstruction] = useState(false);
	const [input, setInput] = useState("");
	const [isDelegating, setIsDelegating] = useState(false);

	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen);
		if (!nextOpen) {
			setInput("");
			setShowInstruction(false);
		}
	}

	async function handleDelegate(instruction: string) {
		setIsDelegating(true);
		try {
			await delegateCase({ caseId, input: instruction });
			handleOpenChange(false);
		} catch (error) {
			toast.add({
				title: "Could not delegate the case",
				description: getConvexErrorMessage(error),
				type: "error",
			});
		} finally {
			setIsDelegating(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger
				render={
					<Button size="lg" className="h-11 rounded-full px-5 shadow-lg" />
				}
			>
				<IconRobot />
				Delegate
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Delegate case {caseReference} to agent</DialogTitle>
				</DialogHeader>
				{showInstruction ? (
					<>
						<Field>
							<FieldLabel htmlFor="agent-task-input">Instruction</FieldLabel>
							<Textarea
								id="agent-task-input"
								value={input}
								onChange={(event) => setInput(event.currentTarget.value)}
								rows={5}
								autoFocus
							/>
						</Field>
						<DialogFooter>
							<Button
								variant="secondary"
								disabled={isDelegating}
								onClick={() => setShowInstruction(false)}
							>
								Back
							</Button>
							<Button
								disabled={input.trim().length === 0 || isDelegating}
								onClick={() => void handleDelegate(input)}
							>
								{isDelegating ? "Delegating…" : "Delegate"}
							</Button>
						</DialogFooter>
					</>
				) : (
					<DialogFooter>
						<Button
							variant="secondary"
							disabled={isDelegating}
							onClick={() => setShowInstruction(true)}
						>
							Delegate with instruction
						</Button>
						<Button
							disabled={isDelegating}
							onClick={() => void handleDelegate(defaultCaseDelegationPrompt)}
						>
							{isDelegating ? "Delegating…" : "Delegate case"}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
