export const builtInToolCatalog = {
	global_search: { defaultActive: true },
	inspect_entity: { defaultActive: true },
	inspect_contact: { defaultActive: true },
	read_case: { defaultActive: true },
	create_case: { defaultActive: true },
	update_case: { defaultActive: true },
	add_case_relation: { defaultActive: true },
	search_emails: { defaultActive: true },
	read_email_thread: { defaultActive: true },
	send_email: { defaultActive: false },
	update_activity: { defaultActive: true },
	update_task_status: { defaultActive: true },
} as const;

export type BuiltInToolKey = keyof typeof builtInToolCatalog;

export const builtInToolKeys = Object.freeze(
	Object.keys(builtInToolCatalog) as BuiltInToolKey[],
);

export const defaultActiveBuiltInToolKeys = Object.freeze(
	builtInToolKeys.filter((key) => builtInToolCatalog[key].defaultActive),
);
