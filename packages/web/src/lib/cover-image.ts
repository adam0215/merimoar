const coverImageModules = import.meta.glob<string>(
	"../assets/covers/*.{avif,jpeg,jpg,png,webp}",
	{
		eager: true,
		import: "default",
		query: "?url",
	},
);

const COVER_IMAGES = Object.entries(coverImageModules)
	.sort(([firstPath], [secondPath]) => firstPath.localeCompare(secondPath))
	.map(([, imageUrl]) => imageUrl);

export function coverImageForId(id: string): string | undefined {
	if (COVER_IMAGES.length === 0) {
		return undefined;
	}

	let hash = 0;
	for (const character of id) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}

	return COVER_IMAGES[hash % COVER_IMAGES.length];
}
