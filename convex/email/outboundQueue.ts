import { Workpool } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

export const emailOutboundPool = new Workpool(
	components.emailOutboundWorkpool,
	{
		maxParallelism: 10,
		retryActionsByDefault: true,
		defaultRetryBehavior: {
			maxAttempts: 4,
			initialBackoffMs: 5_000,
			base: 4,
		},
	},
);

const outboundWorkContext = v.object({
	sendId: v.id("emailSends"),
	generation: v.number(),
});

export const completeOutboundWork = emailOutboundPool.defineOnComplete<
	DataModel,
	typeof outboundWorkContext
>({
	context: outboundWorkContext,
	handler: async (ctx, { workId, context, result }) => {
		const send = await ctx.db.get(context.sendId);
		if (
			!send ||
			send.generation !== context.generation ||
			send.workId !== workId ||
			send.status === "sent" ||
			send.status === "failed"
		) {
			return;
		}

		const queuedFailure =
			send.status === "queued" && send.failure ? send.failure : null;
		const providerMayHaveBeenContacted =
			send.status === "sending" &&
			send.providerCallGeneration === context.generation;
		await ctx.db.patch(send._id, {
			status: "failed",
			failure: {
				...(queuedFailure ??
					(providerMayHaveBeenContacted
						? {
								kind: "ambiguous" as const,
								message:
									"The provider outcome is unknown; the email will not be sent again.",
							}
						: {
								kind: "before_provider" as const,
								reason:
									result.kind === "canceled"
										? ("work_canceled" as const)
										: ("worker_failed" as const),
								message:
									result.kind === "canceled"
										? "Email send work was canceled before contacting the provider."
										: "Email send work failed before contacting the provider.",
							})),
			},
		});
	},
});
