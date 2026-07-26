import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "auto" | "dark";

const THEME_STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "merimoar-theme-change";

export function useTheme() {
	const theme = useSyncExternalStore(
		subscribeToTheme,
		readStoredTheme,
		getServerTheme,
	);

	return { setTheme, theme };
}

function subscribeToTheme(onStoreChange: () => void) {
	const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

	function handleThemeChange() {
		applyTheme(readStoredTheme());
		onStoreChange();
	}

	function handleStorageChange(event: StorageEvent) {
		if (event.key === THEME_STORAGE_KEY) {
			handleThemeChange();
		}
	}

	function handleColorSchemeChange() {
		if (readStoredTheme() === "auto") {
			handleThemeChange();
		}
	}

	window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
	window.addEventListener("storage", handleStorageChange);
	colorScheme.addEventListener("change", handleColorSchemeChange);

	return () => {
		window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
		window.removeEventListener("storage", handleStorageChange);
		colorScheme.removeEventListener("change", handleColorSchemeChange);
	};
}

function readStoredTheme(): ThemeMode {
	try {
		const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
		return isThemeMode(storedTheme) ? storedTheme : "light";
	} catch {
		return "light";
	}
}

function getServerTheme(): ThemeMode {
	return "light";
}

function setTheme(theme: ThemeMode) {
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Applying the theme still works when storage is unavailable.
	}

	applyTheme(theme);
	window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function applyTheme(theme: ThemeMode) {
	const resolvedTheme =
		theme === "auto"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light"
			: theme;
	const root = document.documentElement;

	root.classList.remove("light", "dark");
	root.classList.add(resolvedTheme);
	root.style.colorScheme = resolvedTheme;

	if (theme === "auto") {
		root.removeAttribute("data-theme");
	} else {
		root.setAttribute("data-theme", theme);
	}
}

function isThemeMode(value: string | null): value is ThemeMode {
	return value === "light" || value === "auto" || value === "dark";
}
