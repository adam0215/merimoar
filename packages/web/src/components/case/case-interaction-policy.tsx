import { createContext, useContext } from "react";
import type { ActiveAgentTaskSummary } from "#/components/case/types.ts";

type CaseInteractionPolicy = {
	readOnly: boolean;
	readOnlyReason?: string;
};

const editablePolicy: CaseInteractionPolicy = {
	readOnly: false,
};
const agentOwnedPolicy: CaseInteractionPolicy = {
	readOnly: true,
	readOnlyReason:
		"This case is read only while the task owns it. Take over the task to edit.",
};
const CaseInteractionPolicyContext =
	createContext<CaseInteractionPolicy>(editablePolicy);

export function CaseInteractionPolicyProvider({
	activeAgentTask,
	children,
}: {
	activeAgentTask: ActiveAgentTaskSummary | null;
	children: React.ReactNode;
}) {
	return (
		<CaseInteractionPolicyContext.Provider
			value={activeAgentTask ? agentOwnedPolicy : editablePolicy}
		>
			{children}
		</CaseInteractionPolicyContext.Provider>
	);
}

export function useCurrentCaseInteractionPolicy() {
	return useContext(CaseInteractionPolicyContext);
}
