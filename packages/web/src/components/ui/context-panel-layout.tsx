import { cn } from "#/lib/utils.ts";

export function ContextPanelLayout({
	detailOpen,
	list,
	detail,
	mobileBack,
}: {
	detailOpen: boolean;
	list: React.ReactNode;
	detail: React.ReactNode;
	mobileBack: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"grid h-full min-h-0 grid-cols-1 overflow-hidden",
				detailOpen &&
					"md:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]",
			)}
		>
			<section
				className={cn(
					"min-h-0 overflow-hidden bg-background",
					detailOpen && "hidden md:block md:border-r",
				)}
			>
				{list}
			</section>

			{detailOpen && (
				<section className="min-h-0 min-w-0 overflow-hidden bg-background">
					<div className="flex h-full min-h-0 flex-col">
						<div className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
							{mobileBack}
						</div>
						<div className="min-h-0 flex-1">{detail}</div>
					</div>
				</section>
			)}
		</div>
	);
}
