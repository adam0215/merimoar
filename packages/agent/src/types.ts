export const AGENT_RUN_SHUTDOWN = Symbol("agent-run-shutdown");

export type GlobalSearchFilter =
	| { kind: "all" }
	| { kind: "cases" }
	| { kind: "entities" }
	| { kind: "entity_type"; entityTypeKey: string };

export type TaskStatusUpdate =
	| { status: "completed"; result: string }
	| { status: "waiting"; reason: string }
	| {
			status: "waiting_for_approval";
			approvalId: string;
			approvalRequest: string;
	  }
	| { status: "unable_to_continue"; result: string };

export type AgentActivity = {
	title: string;
	detail?: string;
};

export type CustomToolParameter = {
	name: string;
	type: "string" | "number" | "boolean";
	description: string;
	required: boolean;
};

export type CustomToolDefinition = {
	toolId: string;
	name: string;
	normalizedName: string;
	description: string;
	parameters: readonly CustomToolParameter[];
	requiresApproval: boolean;
	baseUrl: string;
	path: string;
};

export type AgentCaseRelationTarget =
	| { kind: "contact"; contactId: string }
	| { kind: "entity"; entityId: string }
	| { kind: "case"; relatedCaseId: string }
	| { kind: "email_thread"; threadId: string };

export const CASE_STATUSES = [
	"needs_attention",
	"waiting",
	"clear",
	"open",
	"closed",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export type AgentCapabilities = {
	search(input: {
		searchQuery: string;
		filter: GlobalSearchFilter;
	}): Promise<unknown>;
	inspectEntity(input: { entityId: string }): Promise<unknown>;
	inspectContact(input: { contactId: string }): Promise<unknown>;
	readCase(input: { caseId: string }): Promise<unknown>;
	createCase(
		input: {
			title: string;
			description: string;
			dueAt: number | null;
		},
		toolCallId: string,
	): Promise<unknown>;
	updateCase(
		input: {
			caseId: string;
			title?: string;
			description?: string;
			dueAt?: number | null;
			status?: CaseStatus;
		},
		toolCallId: string,
	): Promise<unknown>;
	addCaseRelation(
		input: {
			caseId: string;
			relation: AgentCaseRelationTarget;
		},
		toolCallId: string,
	): Promise<unknown>;
	searchEmails(input: { searchQuery: string }): Promise<unknown>;
	readEmailThread(input: { threadId: string }): Promise<unknown>;
	updateActivity(activity: AgentActivity): Promise<void>;
	updateTaskStatus(
		update: TaskStatusUpdate,
		toolCallId: string,
	): Promise<TaskStatusUpdate>;
	invokeCustomTool(
		toolId: string,
		input: Record<string, unknown>,
	): Promise<unknown>;
};

export type AgentContext = {
	taskId: string;
	capabilities: AgentCapabilities;
};

export type ClaimedRun = {
	runId: string;
	turnId: string;
	taskId: string;
	anchorCaseId: string;
	agentKey: string;
	claimToken: string;
};

export type PersistedTranscript = {
	taskId: string;
	selectedStatusItemId?: string;
	turns: Array<{
		turnId: string;
		sequence: number;
		items: PersistedItem[];
	}>;
};

export type PersistedItem =
	| {
			kind: "member_message";
			body: string;
			sequence: number;
	  }
	| {
			kind: "member_message_steer";
			runId: string;
			body: string;
			sequence: number;
	  }
	| {
			kind: "system_message";
			body: string;
			source: string;
			sequence: number;
	  }
	| {
			kind: "agent_message";
			body: string;
			sequence: number;
	  }
	| ({
			kind: "tool";
			_id: string;
			toolCallId: string;
			toolName: string;
			runId: string;
			inputJson: string;
			sequence: number;
	  } & (
			| { status: "started" | "approval_required" }
			| {
					status: "completed";
					outputJson?: string;
					taskStatusUpdate?: TaskStatusUpdate;
			  }
			| { status: "failed"; error: string }
	  ))
	| {
			kind: "approval";
			approvalId: string;
			approvalKind: "tool" | "task";
			toolItemId?: string;
			signature?: string;
			request: string;
			status: "pending" | "approved" | "denied";
			answerReason?: string;
			continuationRunId?: string;
			consumedAt?: number;
			sequence: number;
	  }
	| {
			kind: "activity";
			title: string;
			detail?: string;
			sequence: number;
	  }
	| {
			kind: "error";
			sequence: number;
	  };

export type AgentRunUsage = {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
};

export type AgentRuntimeAdapter = AgentCapabilities & {
	loadCustomTools(): Promise<CustomToolDefinition[]>;
	getTranscript(): Promise<PersistedTranscript>;
	getSteeringMessages(
		afterSequence: number,
	): Promise<Array<{ body: string; sequence: number }>>;
	renewLease(): Promise<void>;
	startAgentMessage(body: string): Promise<string>;
	updateAgentMessage(itemId: string, body: string): Promise<void>;
	recordToolStarted(input: {
		toolCallId: string;
		toolName: string;
		customToolId?: string;
		inputJson: string;
		summary: string;
	}): Promise<void>;
	recordToolFinished(input: {
		toolCallId: string;
		result:
			| { status: "completed"; outputJson: string; durationMs?: number }
			| { status: "failed"; error: string; durationMs?: number };
	}): Promise<void>;
	recordToolApprovalRequest(input: {
		toolCallId: string;
		approvalId: string;
		request: string;
		signature?: string;
	}): Promise<void>;
	finishRun(usage?: AgentRunUsage): Promise<void>;
	failRun(
		message: string,
		debug?: string,
	): Promise<"failed" | "finalized_selected_status">;
};
