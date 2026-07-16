import {
	createContext,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { getStoredItem, setStoredItem } from "@/lib/browser-storage";

export type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const THEME_COLORS = {
	dark: "hsl(30 15% 8%)",
	light: "hsl(0 0% 98%)",
} as const;

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
	undefined,
);

function readStoredTheme(storageKey: string, fallback: Theme): Theme {
	const storedTheme = getStoredItem("localStorage", storageKey);
	return storedTheme === "dark" ||
		storedTheme === "light" ||
		storedTheme === "system"
		? storedTheme
		: fallback;
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "vite-ui-theme",
}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(() =>
		readStoredTheme(storageKey, defaultTheme),
	);
	const setTheme = useCallback(
		(nextTheme: Theme) => {
			setStoredItem("localStorage", storageKey, nextTheme);
			setThemeState(nextTheme);
		},
		[storageKey],
	);

	useEffect(() => {
		const root = window.document.documentElement;
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		const updateThemeColor = (nextTheme: "light" | "dark") => {
			document
				.querySelector('meta[name="theme-color"]')
				?.setAttribute("content", THEME_COLORS[nextTheme]);
		};

		const applyTheme = (nextTheme: "light" | "dark") => {
			root.classList.remove("light", "dark");
			root.classList.add(nextTheme);
			root.style.colorScheme = nextTheme;
			root.style.backgroundColor = THEME_COLORS[nextTheme];
			updateThemeColor(nextTheme);
		};

		root.classList.add("disable-transitions");

		let cleanupMediaListener: (() => void) | undefined;

		if (theme === "system") {
			const applySystemTheme = () => {
				applyTheme(mediaQuery.matches ? "dark" : "light");
			};

			applySystemTheme();
			mediaQuery.addEventListener("change", applySystemTheme);
			cleanupMediaListener = () =>
				mediaQuery.removeEventListener("change", applySystemTheme);
		} else {
			applyTheme(theme);
		}

		const timeoutId = window.setTimeout(() => {
			root.classList.remove("disable-transitions");
		}, 0);

		return () => {
			window.clearTimeout(timeoutId);
			cleanupMediaListener?.();
		};
	}, [theme]);

	const value = useMemo(() => ({ setTheme, theme }), [setTheme, theme]);

	return (
		<ThemeProviderContext.Provider value={value}>
			{children}
		</ThemeProviderContext.Provider>
	);
}

export { ThemeProviderContext };
