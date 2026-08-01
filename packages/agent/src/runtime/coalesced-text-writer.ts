const DEFAULT_FLUSH_INTERVAL_MS = 4_000;

export class CoalescedTextWriter {
	private body = "";
	private flushedBody = "";
	private flushTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingFlush: Promise<void> = Promise.resolve();
	private persistenceError: unknown;
	private itemIdPromise: Promise<string> | undefined;

	constructor(
		private readonly itemId:
			| string
			| ((initialBody: string) => Promise<string>),
		private readonly persist: (itemId: string, body: string) => Promise<void>,
		private readonly flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
	) {}

	append(text: string) {
		this.body += text;
		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flushTimer = undefined;
				void this.queueFlush();
			}, this.flushIntervalMs);
		}
	}

	async flush() {
		await this.queueFlush();
		if (this.persistenceError) throw this.persistenceError;
	}

	private async queueFlush() {
		const body = this.body;
		this.pendingFlush = this.pendingFlush
			.then(async () => {
				if (body === this.flushedBody || this.persistenceError) return;
				if (!body) return;
				if (typeof this.itemId !== "string" && !this.itemIdPromise) {
					this.itemIdPromise = this.itemId(body);
					await this.itemIdPromise;
				} else {
					await this.persist(await this.resolveItemId(), body);
				}
				this.flushedBody = body;
			})
			.catch((error: unknown) => {
				this.persistenceError ??= error;
			});
		await this.pendingFlush;
	}

	private async resolveItemId() {
		if (typeof this.itemId === "string") return this.itemId;
		if (!this.itemIdPromise) {
			throw new Error(
				"Agent message must have initial text before persistence.",
			);
		}
		return this.itemIdPromise;
	}

	async finish() {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
		await this.flush();
	}
}
