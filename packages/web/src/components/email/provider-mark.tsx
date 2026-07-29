export function ProviderMark({
	provider,
	className = "size-7",
}: {
	provider: string;
	className?: string;
}) {
	if (provider.toLowerCase() === "resend") {
		return (
			<img
				src="/integrations/resend.svg"
				alt="Resend"
				className={`${className} dark:invert`}
			/>
		);
	}

	return (
		<span className="text-sm font-semibold uppercase">
			{provider.slice(0, 1)}
		</span>
	);
}
