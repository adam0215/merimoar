import { defineHandler } from "nitro";
import { handleAgentWorkerPushRequest } from "../../../agent/push-handler";

export default defineHandler((event) =>
	handleAgentWorkerPushRequest(event.req, (execution) => {
		event.waitUntil(execution);
	}),
);
