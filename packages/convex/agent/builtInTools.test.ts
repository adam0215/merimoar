import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import {
	createFixture,
	delegateAndClaim,
	RUNTIME_SECRET,
} from "./testSupport.test-helper";

describe("agent built-in tool configuration", () => {
	it("keeps email off by default and exposes it to runs only when enabled", async () => {
		const fixture = await createFixture();
		const claim = await delegateAndClaim(fixture);
		const runtimeArgs = {
			runtimeSecret: RUNTIME_SECRET,
			runId: claim.runId,
			claimToken: claim.claimToken,
		};

		await expect(
			fixture.actor.query(api.agent.builtInTools.getWorkspaceConfiguration, {}),
		).resolves.toEqual({ emailSendingActive: false });
		expect(
			await fixture.base.mutation(
				api.agent.builtInTools.loadActiveForRun,
				runtimeArgs,
			),
		).not.toContain("send_email");

		await fixture.actor.mutation(api.agent.builtInTools.setEmailSendingActive, {
			active: true,
		});
		await expect(
			fixture.actor.query(api.agent.builtInTools.getWorkspaceConfiguration, {}),
		).resolves.toEqual({ emailSendingActive: true });
		expect(
			await fixture.base.mutation(
				api.agent.builtInTools.loadActiveForRun,
				runtimeArgs,
			),
		).toContain("send_email");
	});
});
