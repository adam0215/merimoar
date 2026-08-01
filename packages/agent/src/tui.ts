import { createOpenAI } from "@ai-sdk/openai";
import { runAgentTUI } from "@ai-sdk/tui";
import { createMerimoarAgent } from "./agent";
import { createLocalAgentContext } from "./local-context";
import { defaultAgentDefinition } from "./manifest";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
	throw new Error("Set OPENAI_API_KEY to run the agent TUI.");
}

const openai = createOpenAI({ apiKey });
const agent = createMerimoarAgent({
	model: openai.responses(defaultAgentDefinition.defaultModel),
	context: createLocalAgentContext(),
});

await runAgentTUI({
	title: "Merimoar agent",
	agent,
	tools: "auto-collapsed",
	reasoning: "collapsed",
});
