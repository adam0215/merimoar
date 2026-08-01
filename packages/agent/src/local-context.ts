import type { AgentContext, CaseStatus, TaskStatusUpdate } from "./types";

type LocalCase = {
	id: string;
	reference: string;
	title: string;
	description: string;
	dueAt: number | null;
	status: CaseStatus;
};

const initialLocalCases: readonly LocalCase[] = [
	{
		id: "case_local_1",
		reference: "CASE-LOCAL",
		title: "TUI example case",
		description: "A local case used by the agent TUI.",
		dueAt: null,
		status: "open",
	},
];

export function createLocalAgentContext(): AgentContext {
	const localCases = initialLocalCases.map((item) => ({ ...item }));
	return {
		taskId: "task_local",
		capabilities: {
			search: async ({ searchQuery }) =>
				localCases.filter((item) =>
					JSON.stringify(item)
						.toLocaleLowerCase()
						.includes(searchQuery.toLocaleLowerCase()),
				),
			inspectEntity: async ({ entityId }) => ({
				entityId,
				message: "No local entity fixture exists.",
			}),
			inspectContact: async ({ contactId }) => ({
				contactId,
				message: "No local contact fixture exists.",
			}),
			readCase: async ({ caseId }) =>
				localCases.find((item) => item.id === caseId) ?? null,
			createCase: async (input) => {
				const created: LocalCase = {
					id: `case_local_${localCases.length + 1}`,
					reference: `CASE-LOCAL-${localCases.length + 1}`,
					title: input.title,
					description: input.description,
					dueAt: input.dueAt,
					status: "open",
				};
				localCases.push(created);
				return created;
			},
			updateCase: async (input) => {
				const caseRecord = localCases.find((item) => item.id === input.caseId);
				if (!caseRecord) return null;
				if (input.title !== undefined) caseRecord.title = input.title;
				if (input.description !== undefined) {
					caseRecord.description = input.description;
				}
				if (input.dueAt !== undefined) caseRecord.dueAt = input.dueAt;
				if (input.status !== undefined) caseRecord.status = input.status;
				return caseRecord;
			},
			addCaseRelation: async (input) => input,
			searchEmails: async ({ searchQuery }) => [
				{
					threadId: "thread_local_1",
					subject: `Local result for ${searchQuery}`,
				},
			],
			readEmailThread: async ({ threadId }) => ({
				threadId,
				messages: [],
			}),
			updateActivity: async () => {},
			updateTaskStatus: async (update: TaskStatusUpdate) => update,
		},
	};
}
