export function formatShortDate(timestamp: number) {
	const date = new Date(timestamp);
	const today = new Date();

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
	}).format(date);
}

export function formatDateTime(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(timestamp));
}

export function formatTime(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(timestamp));
}
