export type BackgroundExecutionRegistrar = (
	execution: Promise<void>,
) => void;

type RequestWithBackgroundExecution = Request & {
	waitUntil?: BackgroundExecutionRegistrar;
};

export function getBackgroundExecutionRegistrar(
	request: Request,
): BackgroundExecutionRegistrar | null {
	const requestWithBackgroundExecution = request as RequestWithBackgroundExecution;
	if (typeof requestWithBackgroundExecution.waitUntil !== "function") {
		return null;
	}
	return (execution) => requestWithBackgroundExecution.waitUntil?.(execution);
}
