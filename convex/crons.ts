import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"retry email webhook cleanup",
	{ minutes: 10 },
	internal.email.integrationActions.sweepWebhookCleanupTasks,
	{},
);

export default crons;
