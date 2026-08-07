import { IconCalendar } from "@tabler/icons-react";
import { sv } from "date-fns/locale";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { Calendar } from "#/components/ui/calendar.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import { fieldSurfaceClassName } from "#/components/ui/field-surface.ts";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover.tsx";
import { formatDateInput, parseDateInput } from "#/lib/date-input.ts";
import { cn } from "#/lib/utils.ts";

export function CaseDeadlineField({
	value,
	onChange,
	disabled = false,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const timestamp = value ? parseDateInput(value) : Number.NaN;
	const selectedDate = Number.isFinite(timestamp)
		? new Date(timestamp)
		: undefined;
	const calendarLocale = useBrowserCalendarLocale();

	return (
		<Field>
			<FieldLabel>Deadline</FieldLabel>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							disabled={disabled}
							className={cn(
								"w-full justify-start text-left font-normal hover:bg-inherit focus-visible:border-input focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:hover:bg-input/50",
								fieldSurfaceClassName,
								!selectedDate && "text-muted-foreground",
							)}
						/>
					}
				>
					<IconCalendar />
					{selectedDate
						? selectedDate.toLocaleDateString(undefined, {
								year: "numeric",
								month: "long",
								day: "numeric",
							})
						: "Select date"}
				</PopoverTrigger>
				<PopoverContent
					align="start"
					variant="calendar"
					className="w-auto gap-0 p-0"
				>
					<Calendar
						mode="single"
						selected={selectedDate}
						locale={calendarLocale}
						onSelect={(date) => {
							if (!date) {
								return;
							}
							onChange(formatDateInput(date.getTime()));
							setOpen(false);
						}}
					/>
					{selectedDate && (
						<div className="border-t p-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="w-full"
								onClick={() => {
									onChange("");
									setOpen(false);
								}}
							>
								Clear date
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>
		</Field>
	);
}

function useBrowserCalendarLocale() {
	const [locale, setLocale] = useState<typeof sv | undefined>();

	useEffect(() => {
		setLocale(navigator.language.startsWith("sv") ? sv : undefined);
	}, []);

	return locale;
}
