const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateInput(value: string) {
	const match = DATE_INPUT_PATTERN.exec(value);
	if (!match) {
		return Number.NaN;
	}

	const year = Number(match[1]);
	const monthIndex = Number(match[2]) - 1;
	const day = Number(match[3]);
	const date = new Date(year, monthIndex, day, 12);

	return date.getFullYear() === year &&
		date.getMonth() === monthIndex &&
		date.getDate() === day
		? date.getTime()
		: Number.NaN;
}

export function formatDateInput(timestamp: number) {
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) {
		return "";
	}

	const year = String(date.getFullYear()).padStart(4, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}
