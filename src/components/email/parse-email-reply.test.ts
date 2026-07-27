import { describe, expect, it } from "vitest";
import { parseEmailReply } from "./parse-email-reply";

describe("parseEmailReply", () => {
	it("separates a Swedish Gmail reply from its quoted history", () => {
		const textBody = `Vad händer om jag svarar på detta mailet, kommer det att funka?

Den sön 26 juli 2026 kl 02:27 skrev Adam G <alex@example.com>:

> Testar Merimoar.
>
> Labore ex nisi fugiat.
>
> // Adam`;

		expect(parseEmailReply(textBody)).toEqual({
			authoredText:
				"Vad händer om jag svarar på detta mailet, kommer det att funka?",
			quotedText: `Den sön 26 juli 2026 kl 02:27 skrev Adam G <alex@example.com>:

> Testar Merimoar.
>
> Labore ex nisi fugiat.
>
> // Adam`,
		});
	});

	it("recognizes English reply introductions and keeps the introduction hidden", () => {
		expect(
			parseEmailReply(`Sounds good.

On Sun, Jul 26, 2026 at 2:27 AM Adam G <adam@example.com> wrote:
> Original message`),
		).toEqual({
			authoredText: "Sounds good.",
			quotedText: `On Sun, Jul 26, 2026 at 2:27 AM Adam G <adam@example.com> wrote:
> Original message`,
		});
	});

	it("recognizes quoted content without an introduction", () => {
		expect(parseEmailReply("My answer\n\n> Earlier question")).toEqual({
			authoredText: "My answer",
			quotedText: "> Earlier question",
		});
	});

	it("recognizes original-message header blocks", () => {
		expect(
			parseEmailReply(`Approved.

From: Adam G <adam@example.com>
Sent: Sunday, July 26, 2026 02:27
To: Support <support@example.com>
Subject: Policy review

Can you review this?`),
		).toEqual({
			authoredText: "Approved.",
			quotedText: `From: Adam G <adam@example.com>
Sent: Sunday, July 26, 2026 02:27
To: Support <support@example.com>
Subject: Policy review

Can you review this?`,
		});
	});

	it("leaves authored text unchanged when it has no reply history", () => {
		expect(parseEmailReply("A complete standalone message.")).toEqual({
			authoredText: "A complete standalone message.",
		});
	});
});
