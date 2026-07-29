import { describe, expect, it } from "vitest";
import {
	normalizeResendEmail,
	parseMessageIds,
	parseParticipant,
} from "#/email/normalize";

describe("email normalization", () => {
	it("normalizes participants without losing the observed display name", () => {
		expect(parseParticipant('"Ada Lovelace" <ADA@Example.com>')).toEqual({
			name: "Ada Lovelace",
			address: "ada@example.com",
		});
		expect(parseParticipant("support@example.com")).toEqual({
			address: "support@example.com",
		});
	});

	it("extracts RFC message identifiers in order", () => {
		expect(parseMessageIds("<first@example.com> <second@example.com>")).toEqual(
			["<first@example.com>", "<second@example.com>"],
		);
	});

	it("converts a Resend email into the provider-neutral app format", () => {
		const normalized = normalizeResendEmail(
			{
				id: "resend-email-1",
				to: ["inbox@merimoar.test"],
				from: "Ada <ada@example.com>",
				created_at: "2026-07-25T10:02:00.000Z",
				subject: "Re: Policy review",
				bcc: null,
				cc: ["Grace <grace@example.com>"],
				reply_to: null,
				html: "<p>Fallback body</p>",
				text: null,
				headers: {
					Date: "Sat, 25 Jul 2026 12:00:00 +0200",
					"In-Reply-To": "<original@example.com>",
					References: "<root@example.com> <original@example.com>",
				},
				message_id: "<reply@example.com>",
			},
			() => "Fallback body",
		);

		expect(normalized).toMatchObject({
			externalMessageId: "resend-email-1",
			internetMessageId: "<reply@example.com>",
			inReplyTo: "<original@example.com>",
			references: ["<root@example.com>", "<original@example.com>"],
			from: { name: "Ada", address: "ada@example.com" },
			textBody: "Fallback body",
		});
	});
});
