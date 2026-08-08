import { composeCustomToolEndpoint } from "@merimoar/convex/agent/custom-tool-model";
import type { Doc } from "@merimoar/convex/data-model";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "#/components/ui/input-group.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { toast } from "#/components/ui/toast.tsx";
import {
	saveCustomTool,
	testCustomTool,
} from "#/integrations/custom-tools/functions.ts";
import { CustomIntegrationDialog } from "./custom-integration-dialog.tsx";

export type CustomToolConfiguration = Doc<"agentCustomTools"> & {
	needsRetest: boolean;
};

export type CustomIntegrationConfiguration = Doc<"customIntegrations"> & {
	tools: CustomToolConfiguration[];
};

type ParameterDraft = Doc<"agentCustomTools">["parameters"][number] & {
	key: string;
	testValue: string;
};

type ToolForm = {
	integrationChoice: string;
	name: string;
	description: string;
	path: string;
	requiresApproval: boolean;
	parameters: ParameterDraft[];
};

type TestResult = Awaited<ReturnType<typeof testCustomTool>> & {
	binding: string;
};

const CREATE_INTEGRATION = "__create_integration__";

function parameterKey() {
	return crypto.randomUUID();
}

function requestFields(form: ToolForm) {
	return {
		name: form.name,
		description: form.description,
		path: form.path,
		parameters: form.parameters.map(
			({ name, type, description, required }) => ({
				name,
				type,
				description,
				required,
			}),
		),
		requiresApproval: form.requiresApproval,
	};
}

function testValues(form: ToolForm) {
	const values: [string, string | number | boolean][] = [];
	for (const parameter of form.parameters) {
		if (!parameter.required && !parameter.testValue) continue;
		if (parameter.type === "number") {
			if (parameter.testValue) {
				values.push([parameter.name, Number(parameter.testValue)]);
			}
		} else if (parameter.type === "boolean") {
			values.push([parameter.name, parameter.testValue === "true"]);
		} else {
			values.push([parameter.name, parameter.testValue]);
		}
	}
	return Object.fromEntries(values);
}

function selectedBaseUrl(
	form: ToolForm,
	integrations: CustomIntegrationConfiguration[],
) {
	return (
		integrations.find(
			(integration) => integration._id === form.integrationChoice,
		)?.baseUrl ?? ""
	);
}

function configurationSignature(
	form: ToolForm,
	integrations: CustomIntegrationConfiguration[],
) {
	return JSON.stringify({
		baseUrl: selectedBaseUrl(form, integrations),
		path: form.path,
		parameters: requestFields(form).parameters,
	});
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Try again.";
}

export function CustomToolDialog({
	tool,
	integrations,
	onClose,
}: {
	tool?: CustomToolConfiguration;
	integrations: CustomIntegrationConfiguration[];
	onClose(): void;
}) {
	const [form, setForm] = useState<ToolForm>(() => ({
		integrationChoice: tool?.integrationId ?? integrations[0]?._id ?? "",
		name: tool?.name ?? "",
		description: tool?.description ?? "",
		path: tool?.path.replace(/^\/+/, "") ?? "",
		requiresApproval: tool?.requiresApproval ?? true,
		parameters:
			tool?.parameters.map((parameter) => ({
				key: parameterKey(),
				...parameter,
				testValue: parameter.type === "boolean" ? "true" : "",
			})) ?? [],
	}));
	const [initialSignature] = useState(() =>
		configurationSignature(form, integrations),
	);
	const [result, setResult] = useState<TestResult | null>(null);
	const [pending, setPending] = useState<"test" | "save" | null>(null);
	const [creatingIntegration, setCreatingIntegration] = useState(false);
	const [openParameterKeys, setOpenParameterKeys] = useState<string[]>(() =>
		form.parameters[0] ? [form.parameters[0].key] : [],
	);
	const testing = pending === "test";
	const saving = pending === "save";

	const fields = requestFields(form);
	const values = testValues(form);
	const currentSignature = configurationSignature(form, integrations);
	const currentTestBinding = JSON.stringify({
		configuration: currentSignature,
		testValues: values,
	});
	const activeResult = result?.binding === currentTestBinding ? result : null;
	let endpoint: string | null;
	try {
		endpoint = composeCustomToolEndpoint(
			selectedBaseUrl(form, integrations),
			form.path,
		);
	} catch {
		endpoint = null;
	}
	const canReuseSavedTest =
		Boolean(tool) &&
		!tool?.needsRetest &&
		currentSignature === initialSignature;
	const canSave = Boolean(activeResult) || canReuseSavedTest;
	const integration = {
		kind: "existing" as const,
		integrationId: form.integrationChoice,
	};
	const selectedIntegration = integrations.find(
		(item) => item._id === form.integrationChoice,
	);
	const integrationItems = [
		...integrations.map((item) => ({ value: item._id, label: item.name })),
		{ value: CREATE_INTEGRATION, label: "Create integration" },
	];

	function updateForm(update: Partial<ToolForm>) {
		setForm((current) => ({ ...current, ...update }));
	}

	function updateParameter(key: string, update: Partial<ParameterDraft>) {
		setForm((current) => ({
			...current,
			parameters: current.parameters.map((parameter) =>
				parameter.key === key ? { ...parameter, ...update } : parameter,
			),
		}));
	}

	function addParameter() {
		const key = parameterKey();
		setForm((current) => ({
			...current,
			parameters: [
				...current.parameters,
				{
					key,
					name: "",
					type: "string",
					description: "",
					required: true,
					testValue: "",
				},
			],
		}));
		setOpenParameterKeys([key]);
	}

	function removeParameter(key: string) {
		setForm((current) => ({
			...current,
			parameters: current.parameters.filter(
				(parameter) => parameter.key !== key,
			),
		}));
		setOpenParameterKeys((current) =>
			current.filter((openKey) => openKey !== key),
		);
	}

	async function testRequest() {
		if (pending) return;
		setPending("test");
		try {
			const tested = await testCustomTool({
				data: {
					integration,
					fields,
					testValues: values,
				},
			});
			setResult({ ...tested, binding: currentTestBinding });
		} catch (error) {
			setResult(null);
			toast.add({
				title: "Test failed",
				description: errorMessage(error),
				type: "error",
			});
		} finally {
			setPending(null);
		}
	}

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending || !canSave) return;
		setPending("save");
		try {
			await saveCustomTool({
				data: {
					...(tool ? { toolId: tool._id } : {}),
					integration,
					fields,
					...(activeResult
						? {
								testProof: activeResult.testProof,
								testValues: values,
							}
						: {}),
				},
			});
			onClose();
		} catch (error) {
			toast.add({
				title: "Tool could not be saved",
				description: errorMessage(error),
				type: "error",
			});
		} finally {
			setPending(null);
		}
	}

	return (
		<>
			<Dialog
				open
				onOpenChange={(next) => pending === null && !next && onClose()}
			>
				<DialogContent className="max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-3xl">
					<form onSubmit={save} className="contents">
						<DialogHeader>
							<DialogTitle>
								{tool ? "Edit custom tool" : "Add custom tool"}
							</DialogTitle>
							<DialogDescription>
								{tool
									? "Update the tool and test request changes before saving."
									: "Create a tool that calls an API endpoint of your choice."}
							</DialogDescription>
						</DialogHeader>

						<div className="min-w-0 space-y-6">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label>Integration</Label>
									<Select
										items={integrationItems}
										value={form.integrationChoice || null}
										onValueChange={(value) => {
											if (!value) return;
											if (value === CREATE_INTEGRATION) {
												setCreatingIntegration(true);
												return;
											}
											updateForm({ integrationChoice: value });
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue>
												{selectedIntegration?.name ?? "Select integration"}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{integrations.map((item) => (
												<SelectItem key={item._id} value={item._id}>
													{item.name}
												</SelectItem>
											))}
											<SelectItem value={CREATE_INTEGRATION}>
												<IconPlus /> Create integration
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="custom-tool-name">Name</Label>
									<Input
										id="custom-tool-name"
										value={form.name}
										onChange={(event) =>
											updateForm({ name: event.target.value })
										}
										placeholder="e.g. Read temperature metrics"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="custom-tool-description">Description</Label>
									<Input
										id="custom-tool-description"
										value={form.description}
										onChange={(event) =>
											updateForm({ description: event.target.value })
										}
										placeholder="Describe to the agent what the tool does"
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="custom-tool-path">Endpoint Path</Label>
								<InputGroup data-disabled={!selectedIntegration || undefined}>
									<InputGroupAddon className="min-w-0 basis-0 flex-1 cursor-default px-3">
										<InputGroupText className="truncate font-mono text-xs">
											{selectedIntegration?.baseUrl.replace(/\/$/, "") ??
												"Select an integration"}
										</InputGroupText>
									</InputGroupAddon>
									<InputGroupAddon className="cursor-default border-x border-input bg-muted px-3">
										<InputGroupText>/</InputGroupText>
									</InputGroupAddon>
									<InputGroupInput
										className="min-w-0 basis-0 flex-1"
										id="custom-tool-path"
										value={form.path}
										onChange={(event) =>
											updateForm({ path: event.target.value })
										}
										placeholder="e.g. bms/measurements"
										spellCheck={false}
									/>
								</InputGroup>
								<p className="text-xs text-muted-foreground">
									The tool sends a POST request to this endpoint.
								</p>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between gap-3">
									<h3 className="font-semibold">Body parameters</h3>
									{form.parameters.length === 0 && (
										<Button
											type="button"
											variant="secondary"
											size="sm"
											disabled={form.parameters.length >= 20}
											onClick={addParameter}
										>
											<IconPlus /> Add parameter
										</Button>
									)}
								</div>
								{form.parameters.length === 0 ? (
									<p className="py-6 text-center text-sm text-muted-foreground">
										No body parameters
									</p>
								) : (
									<>
										<Accordion
											value={openParameterKeys}
											onValueChange={setOpenParameterKeys}
											className="overflow-hidden rounded-xl border"
										>
											{form.parameters.map((parameter) => (
												<AccordionItem
													key={parameter.key}
													value={parameter.key}
													className="relative"
												>
													<AccordionTrigger className="px-3 pr-12">
														<span className="truncate">
															{parameter.name || "New parameter"}
														</span>
													</AccordionTrigger>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														className="absolute top-2.5 right-2 z-20"
														aria-label={`Remove ${parameter.name || "parameter"}`}
														onClick={(event) => {
															event.stopPropagation();
															removeParameter(parameter.key);
														}}
													>
														<IconTrash />
													</Button>
													<AccordionContent className="p-3">
														<ParameterEditor
															parameter={parameter}
															onChange={(update) =>
																updateParameter(parameter.key, update)
															}
														/>
													</AccordionContent>
												</AccordionItem>
											))}
										</Accordion>
										<div className="flex justify-end">
											<Button
												type="button"
												variant="secondary"
												size="sm"
												disabled={form.parameters.length >= 20}
												onClick={addParameter}
											>
												<IconPlus /> Add parameter
											</Button>
										</div>
									</>
								)}
							</div>

							<div className="flex items-center justify-between gap-4 rounded-xl border p-4">
								<div>
									<Label htmlFor="custom-tool-approval">Require approval</Label>
									<p className="mt-1 text-xs text-muted-foreground">
										Ask a member before every call.
									</p>
								</div>
								<Switch
									id="custom-tool-approval"
									checked={form.requiresApproval}
									onCheckedChange={(checked) =>
										updateForm({ requiresApproval: checked })
									}
								/>
							</div>

							<section
								className="min-w-0 space-y-3"
								aria-labelledby="test-result-heading"
							>
								<h3 id="test-result-heading" className="font-semibold">
									Test result
								</h3>
								{activeResult ? (
									<div className="min-w-0 space-y-6">
										<div className="flex min-w-0 items-center gap-2 text-sm">
											<Badge
												variant={
													activeResult.status >= 200 &&
													activeResult.status < 300
														? "success"
														: "destructive"
												}
											>
												HTTP {activeResult.status}
											</Badge>
											<span className="min-w-0 truncate font-mono text-foreground">
												{activeResult.endpoint}
											</span>
											<span className="ml-auto shrink-0 text-muted-foreground">
												{activeResult.durationMs} ms
											</span>
										</div>
										<div className="min-w-0 space-y-2">
											<h4 className="text-sm font-medium">Response</h4>
											<pre className="max-h-48 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
												{activeResult.jsonPreview}
											</pre>
										</div>
									</div>
								) : (
									<p className="py-8 text-center text-sm text-muted-foreground">
										{canReuseSavedTest
											? "Nothing has changed that requires another test."
											: "Test the request to continue."}
									</p>
								)}
							</section>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								disabled={testing || saving}
								onClick={onClose}
							>
								Cancel
							</Button>
							<Button
								type="button"
								variant="secondary"
								disabled={testing || saving || !endpoint}
								onClick={testRequest}
							>
								{testing ? "Testing…" : "Test request"}
							</Button>
							<Button type="submit" disabled={testing || saving || !canSave}>
								{saving ? "Saving…" : "Save"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			{creatingIntegration && (
				<CustomIntegrationDialog
					onClose={() => setCreatingIntegration(false)}
					onSaved={(integrationId) => {
						updateForm({ integrationChoice: integrationId });
						setCreatingIntegration(false);
					}}
				/>
			)}
		</>
	);
}

function ParameterEditor({
	parameter,
	onChange,
}: {
	parameter: ParameterDraft;
	onChange(update: Partial<ParameterDraft>): void;
}) {
	const requiredId = `parameter-${parameter.key}-required`;

	return (
		<div className="space-y-3">
			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
				<div className="space-y-2">
					<Label>Name</Label>
					<Input
						value={parameter.name}
						onChange={(event) => onChange({ name: event.target.value })}
						placeholder="Match the parameter name in the API"
						spellCheck={false}
					/>
				</div>
				<div className="space-y-2">
					<Label>Type</Label>
					<Select
						value={parameter.type}
						onValueChange={(value) => {
							if (!value) return;
							onChange({
								type: value,
								testValue: value === "boolean" ? "true" : "",
							});
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="string">String</SelectItem>
							<SelectItem value="number">Number</SelectItem>
							<SelectItem value="boolean">Boolean</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
				<div className="space-y-2">
					<Label>Description</Label>
					<Input
						value={parameter.description}
						onChange={(event) => onChange({ description: event.target.value })}
						placeholder="Describe this parameter to the agent"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={requiredId}>Required</Label>
					<div className="flex h-9 items-center">
						<Switch
							id={requiredId}
							checked={parameter.required}
							onCheckedChange={(checked) => onChange({ required: checked })}
						/>
					</div>
				</div>
			</div>
			<div className="space-y-2">
				<Label>Test value</Label>
				{parameter.type === "boolean" ? (
					<Select
						value={parameter.testValue}
						onValueChange={(value) => value && onChange({ testValue: value })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="true">True</SelectItem>
							<SelectItem value="false">False</SelectItem>
						</SelectContent>
					</Select>
				) : (
					<Input
						type={parameter.type === "number" ? "number" : "text"}
						value={parameter.testValue}
						onChange={(event) => onChange({ testValue: event.target.value })}
						placeholder={
							parameter.type === "number" ? "e.g. 42" : "e.g. sensor-123"
						}
					/>
				)}
				<p className="text-xs text-muted-foreground">
					Only used when testing this tool.
				</p>
			</div>
		</div>
	);
}
