import type { AgentToolKey } from "../manifest";
import type { AgentContext } from "../types";
import { createAddCaseRelationTool } from "./add-case-relation/ai-sdk";
import { createCreateCaseTool } from "./create-case/ai-sdk";
import { createGlobalSearchTool } from "./global-search/ai-sdk";
import { createInspectContactTool } from "./inspect-contact/ai-sdk";
import { createInspectEntityTool } from "./inspect-entity/ai-sdk";
import { createReadCaseTool } from "./read-case/ai-sdk";
import { createReadEmailThreadTool } from "./read-email-thread/ai-sdk";
import { createSearchEmailsTool } from "./search-emails/ai-sdk";
import { createUpdateActivityTool } from "./update-activity/ai-sdk";
import { createUpdateCaseTool } from "./update-case/ai-sdk";
import { createUpdateTaskStatusTool } from "./update-task-status/ai-sdk";

export function createBuiltins(context: AgentContext) {
	return {
		global_search: createGlobalSearchTool(context),
		inspect_entity: createInspectEntityTool(context),
		inspect_contact: createInspectContactTool(context),
		read_case: createReadCaseTool(context),
		create_case: createCreateCaseTool(context),
		update_case: createUpdateCaseTool(context),
		add_case_relation: createAddCaseRelationTool(context),
		search_emails: createSearchEmailsTool(context),
		read_email_thread: createReadEmailThreadTool(context),
		update_activity: createUpdateActivityTool(context),
		update_task_status: createUpdateTaskStatusTool(context),
	} satisfies Record<AgentToolKey, unknown>;
}
