import type { Tool } from "ai";
import type { AgentContext } from "../types";
import { createAddCaseRelationTool } from "./add-case-relation/ai-sdk";
import type { BuiltInToolKey } from "./catalog";
import { createCreateCaseTool } from "./create-case/ai-sdk";
import { createGlobalSearchTool } from "./global-search/ai-sdk";
import { createInspectContactTool } from "./inspect-contact/ai-sdk";
import { createInspectEntityTool } from "./inspect-entity/ai-sdk";
import { createReadCaseTool } from "./read-case/ai-sdk";
import { createReadEmailThreadTool } from "./read-email-thread/ai-sdk";
import { createSearchEmailsTool } from "./search-emails/ai-sdk";
import { createSendEmailTool } from "./send-email/ai-sdk";
import { createUpdateActivityTool } from "./update-activity/ai-sdk";
import { createUpdateCaseTool } from "./update-case/ai-sdk";
import { createUpdateTaskStatusTool } from "./update-task-status/ai-sdk";

const builtInToolFactories = {
	global_search: createGlobalSearchTool,
	inspect_entity: createInspectEntityTool,
	inspect_contact: createInspectContactTool,
	read_case: createReadCaseTool,
	create_case: createCreateCaseTool,
	update_case: createUpdateCaseTool,
	add_case_relation: createAddCaseRelationTool,
	search_emails: createSearchEmailsTool,
	read_email_thread: createReadEmailThreadTool,
	send_email: createSendEmailTool,
	update_activity: createUpdateActivityTool,
	update_task_status: createUpdateTaskStatusTool,
} satisfies Record<BuiltInToolKey, (context: AgentContext) => Tool>;

export function createBuiltInTools(
	context: AgentContext,
	activeTools: readonly BuiltInToolKey[],
) {
	return Object.fromEntries(
		activeTools.map((key) => [key, builtInToolFactories[key](context)]),
	);
}
