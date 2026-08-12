import {
	AGENT_RUN_PUSH_SIGNATURE_HEADER,
	serializeAgentRunPushPayload,
	signAgentRunPushBody,
} from "@merimoar/agent/runtime/push";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
	env,
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";

const PUSH_DELIVERY_TIMEOUT_MS = 30_000;
const PUSH_RECOVERY_GRACE_MS = 15_000;
const MAXIMUM_RESPONSE_BYTES = 4_096;

type PushDeliveryCoordinates = {
	runId: Id<"agentRuns">;
	leaseGeneration: number;
	attempt: number;
};

export async function scheduleAgentRunPush(
	ctx: Pick<MutationCtx, "db" | "scheduler">,
	args: { runId: Id<"agentRuns">; leaseGeneration: number },
) {
	if (env.AGENT_RUN_TRANSPORT !== "push") return;
	const run = await ctx.db.get(args.runId);
	if (
		run?.status !== "queued" ||
		run.leaseGeneration !== args.leaseGeneration
	) {
		return;
	}
	const delivery = { ...args, attempt: 0 };
	await ctx.db.patch(args.runId, { pushDeliveryAttempt: delivery.attempt });
	await schedulePushDeliveryAttempt(ctx, delivery, 0);
}

export const isDeliveryCurrent = internalQuery({
	args: {
		runId: v.id("agentRuns"),
		leaseGeneration: v.number(),
		attempt: v.number(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		return await pushDeliveryIsCurrent(ctx, args);
	},
});

export const retryDelivery = internalMutation({
	args: {
		runId: v.id("agentRuns"),
		leaseGeneration: v.number(),
		attempt: v.number(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		return await advancePushDelivery(ctx, args, retryDelay(args.attempt));
	},
});

export const recoverDelivery = internalMutation({
	args: {
		runId: v.id("agentRuns"),
		leaseGeneration: v.number(),
		attempt: v.number(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		return await advancePushDelivery(ctx, args, 0);
	},
});

export const deliver = internalAction({
	args: {
		runId: v.id("agentRuns"),
		leaseGeneration: v.number(),
		attempt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const current: boolean = await ctx.runQuery(
			internal.agent.push.isDeliveryCurrent,
			args,
		);
		if (!current) return null;

		try {
			const configuration = requirePushConfiguration();
			const sentAt = Date.now();
			const deliveryId = `${args.runId}:${args.leaseGeneration}:${args.attempt}`;
			const body = serializeAgentRunPushPayload({
				runId: args.runId,
				leaseGeneration: args.leaseGeneration,
				deliveryId,
				sentAt,
			});
			const signature = await signAgentRunPushBody(
				body,
				configuration.signingSecret,
			);
			const response = await fetch(configuration.url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					[AGENT_RUN_PUSH_SIGNATURE_HEADER]: signature,
				},
				body,
				signal: AbortSignal.timeout(PUSH_DELIVERY_TIMEOUT_MS),
			});
			await readLimitedResponse(response, MAXIMUM_RESPONSE_BYTES);
			if (!response.ok) {
				throw new Error(`Agent run push endpoint returned ${response.status}.`);
			}
		} catch (error) {
			const retryScheduled: boolean = await ctx.runMutation(
				internal.agent.push.retryDelivery,
				args,
			);
			if (retryScheduled) {
				console.warn("agent_push_delivery_failed", {
					runId: args.runId,
					leaseGeneration: args.leaseGeneration,
					attempt: args.attempt + 1,
					retryInMs: retryDelay(args.attempt),
					error: error instanceof Error ? error.message : "Unknown push error",
				});
			}
		}
		return null;
	},
});

async function pushDeliveryIsCurrent(
	ctx: Pick<QueryCtx, "db">,
	delivery: PushDeliveryCoordinates,
) {
	if (env.AGENT_RUN_TRANSPORT !== "push") return false;
	const run = await ctx.db.get(delivery.runId);
	return (
		run?.status === "queued" &&
		run.leaseGeneration === delivery.leaseGeneration &&
		run.pushDeliveryAttempt === delivery.attempt
	);
}

async function advancePushDelivery(
	ctx: Pick<MutationCtx, "db" | "scheduler">,
	delivery: PushDeliveryCoordinates,
	delayMs: number,
) {
	if (!(await pushDeliveryIsCurrent(ctx, delivery))) return false;
	const nextDelivery = { ...delivery, attempt: delivery.attempt + 1 };
	await ctx.db.patch(delivery.runId, {
		pushDeliveryAttempt: nextDelivery.attempt,
	});
	await schedulePushDeliveryAttempt(ctx, nextDelivery, delayMs);
	return true;
}

async function schedulePushDeliveryAttempt(
	ctx: Pick<MutationCtx, "scheduler">,
	delivery: PushDeliveryCoordinates,
	delayMs: number,
) {
	await ctx.scheduler.runAfter(delayMs, internal.agent.push.deliver, delivery);
	await ctx.scheduler.runAfter(
		delayMs + PUSH_DELIVERY_TIMEOUT_MS + PUSH_RECOVERY_GRACE_MS,
		internal.agent.push.recoverDelivery,
		delivery,
	);
}

function requirePushConfiguration() {
	if (env.AGENT_RUN_TRANSPORT !== "push") {
		throw new Error("Agent run push delivery is not enabled.");
	}
	if (!env.AGENT_RUN_PUSH_URL || !env.AGENT_RUN_PUSH_SIGNING_SECRET) {
		throw new Error("Agent run push delivery is not configured.");
	}
	if (env.AGENT_RUN_PUSH_SIGNING_SECRET.length < 32) {
		throw new Error(
			"AGENT_RUN_PUSH_SIGNING_SECRET must contain at least 32 characters.",
		);
	}
	const url = new URL(env.AGENT_RUN_PUSH_URL);
	if (url.protocol !== "https:" || url.username || url.password || url.hash) {
		throw new Error("AGENT_RUN_PUSH_URL must be a credential-free HTTPS URL.");
	}
	return { url, signingSecret: env.AGENT_RUN_PUSH_SIGNING_SECRET };
}

function retryDelay(attempt: number) {
	return Math.min(1_000 * 2 ** Math.min(attempt, 6), 60_000);
}

async function readLimitedResponse(response: Response, maximumBytes: number) {
	if (!response.body) return;
	const reader = response.body.getReader();
	let byteLength = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return;
		byteLength += value.byteLength;
		if (byteLength > maximumBytes) {
			await reader.cancel();
			throw new Error("Agent run push response was too large.");
		}
	}
}
