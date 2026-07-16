type SakuraFooterPowered = {
	show: boolean;
	prefix: string;
	name: string;
	url: string;
};

export type SakuraRuntimeConfig = {
	backgroundImage: string;
	mobileBackgroundImage: string;
	title: string;
	logo: string;
	favicon: string;
	description: string;
	links: string;
	illustration: string;
	loadingIllustration: string;
	showNetTransfer: boolean;
	fixedTopServerName: boolean;
	forceUseSvgFlag: boolean;
	disableAnimatedMan: boolean;
	forceShowServices: boolean;
	forceCardInline: boolean;
	forceShowMap: boolean;
	forcePeakCutEnabled: boolean;
	forceTheme?: "dark" | "light";
	footerPowered: SakuraFooterPowered;
};

declare global {
	interface Window {
		CustomBackgroundImage?: string;
		CustomMobileBackgroundImage?: string;
		CustomTitle?: string;
		CustomSiteName?: string;
		CustomLogo?: string;
		CustomFavicon?: string;
		CustomDesc?: string;
		CustomLinks?: string;
		CustomIllustration?: string;
		CustomLoadingIllustration?: string;
		ShowNetTransfer?: boolean;
		FixedTopServerName?: boolean;
		ForceUseSvgFlag?: boolean;
		DisableAnimatedMan?: boolean;
		ForceTheme?: string;
		ForceShowServices?: boolean;
		ForceCardInline?: boolean;
		ForceShowMap?: boolean;
		ForcePeakCutEnabled?: boolean;
		ForceSortType?: string;
		ForceSortOrder?: string;
		CustomFooterPowered?: Partial<SakuraFooterPowered>;
		__sakuraSyncThemeConfig?: () => void;
	}
}

export const SAKURA_CONFIG_CHANGE_EVENT = "sakura-config-change";

const SAKURA_ASSET_BASE = "/sakura-assets";

const SAKURA_WINDOW_OVERRIDE_KEYS = [
	"CustomBackgroundImage",
	"CustomMobileBackgroundImage",
	"CustomTitle",
	"CustomSiteName",
	"CustomLogo",
	"CustomFavicon",
	"CustomDesc",
	"CustomLinks",
	"CustomIllustration",
	"CustomLoadingIllustration",
	"ShowNetTransfer",
	"FixedTopServerName",
	"ForceUseSvgFlag",
	"DisableAnimatedMan",
	"ForceTheme",
	"ForceShowServices",
	"ForceCardInline",
	"ForceShowMap",
	"ForcePeakCutEnabled",
	"ForceSortType",
	"ForceSortOrder",
	"CustomFooterPowered",
] as const satisfies readonly (keyof Window)[];

export const SAKURA_DEFAULT_CONFIG: SakuraRuntimeConfig = {
	backgroundImage: `${SAKURA_ASSET_BASE}/sakura-background.jpg`,
	mobileBackgroundImage: `${SAKURA_ASSET_BASE}/sakura-background.jpg`,
	title: "Sakura Monitoring",
	logo: `${SAKURA_ASSET_BASE}/sakura-mark.png`,
	favicon: `${SAKURA_ASSET_BASE}/sakura-mark.png`,
	description: "樱花探针",
	links: "",
	illustration: `${SAKURA_ASSET_BASE}/sakura-illustration.webp`,
	loadingIllustration: `${SAKURA_ASSET_BASE}/sakura-loading.gif`,
	showNetTransfer: true,
	fixedTopServerName: true,
	forceUseSvgFlag: true,
	disableAnimatedMan: false,
	forceShowServices: false,
	forceCardInline: false,
	forceShowMap: false,
	forcePeakCutEnabled: false,
	footerPowered: {
		show: true,
		prefix: "Powered by",
		name: "VAMPIRE",
		url: "https://github.com/VAMPIRE0924",
	},
};

export function resetSakuraRuntimeConfigOverrides(): void {
	if (typeof window === "undefined") return;
	for (const key of SAKURA_WINDOW_OVERRIDE_KEYS) {
		Reflect.deleteProperty(window, key);
	}
}

function readString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function hasOwnWindowValue(key: keyof Window): boolean {
	return Object.getOwnPropertyDescriptor(window, key) !== undefined;
}

function readCustomString(
	key: keyof Window,
	fallback: string,
	reader: (value: unknown) => string = readString,
): string {
	if (!hasOwnWindowValue(key)) return fallback;
	return reader(window[key]);
}

function readCustomBoolean(key: keyof Window, fallback: boolean): boolean {
	if (!hasOwnWindowValue(key)) return fallback;
	return readBoolean(window[key], fallback);
}

export function readSafeUrl(value: unknown): string {
	const url = readString(value);
	if (!url) return "";
	if (/["\\\r\n]/.test(url)) return "";

	try {
		const parsed = new URL(
			url,
			typeof window === "undefined"
				? "https://example.invalid"
				: window.location.origin,
		);

		return parsed.protocol === "http:" || parsed.protocol === "https:"
			? url
			: "";
	} catch {
		return "";
	}
}

function readBoolean(value: unknown, fallback = false): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function readForceTheme(value: unknown): SakuraRuntimeConfig["forceTheme"] {
	return value === "dark" || value === "light" ? value : undefined;
}

function readFooterPowered(value: unknown): SakuraFooterPowered {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return SAKURA_DEFAULT_CONFIG.footerPowered;
	}

	const footer = value as Partial<SakuraFooterPowered>;
	const hasField = (key: keyof SakuraFooterPowered) =>
		Object.getOwnPropertyDescriptor(footer, key) !== undefined;

	return {
		show: readBoolean(footer.show, SAKURA_DEFAULT_CONFIG.footerPowered.show),
		prefix: hasField("prefix")
			? readString(footer.prefix)
			: SAKURA_DEFAULT_CONFIG.footerPowered.prefix,
		name: hasField("name")
			? readString(footer.name)
			: SAKURA_DEFAULT_CONFIG.footerPowered.name,
		url: hasField("url")
			? readSafeUrl(footer.url)
			: SAKURA_DEFAULT_CONFIG.footerPowered.url,
	};
}

export function getSakuraRuntimeConfig(): SakuraRuntimeConfig {
	if (typeof window === "undefined") {
		return SAKURA_DEFAULT_CONFIG;
	}

	const customTitle = hasOwnWindowValue("CustomTitle")
		? readString(window.CustomTitle) ||
			(hasOwnWindowValue("CustomSiteName")
				? readString(window.CustomSiteName)
				: "")
		: readCustomString("CustomSiteName", SAKURA_DEFAULT_CONFIG.title);

	return {
		backgroundImage: readCustomString(
			"CustomBackgroundImage",
			SAKURA_DEFAULT_CONFIG.backgroundImage,
			readSafeUrl,
		),
		mobileBackgroundImage: readCustomString(
			"CustomMobileBackgroundImage",
			SAKURA_DEFAULT_CONFIG.mobileBackgroundImage,
			readSafeUrl,
		),
		title: customTitle,
		logo: readCustomString(
			"CustomLogo",
			SAKURA_DEFAULT_CONFIG.logo,
			readSafeUrl,
		),
		favicon: readCustomString(
			"CustomFavicon",
			SAKURA_DEFAULT_CONFIG.favicon,
			readSafeUrl,
		),
		description: readCustomString(
			"CustomDesc",
			SAKURA_DEFAULT_CONFIG.description,
		),
		links: readCustomString("CustomLinks", SAKURA_DEFAULT_CONFIG.links),
		illustration: readCustomString(
			"CustomIllustration",
			SAKURA_DEFAULT_CONFIG.illustration,
			readSafeUrl,
		),
		loadingIllustration: readCustomString(
			"CustomLoadingIllustration",
			SAKURA_DEFAULT_CONFIG.loadingIllustration,
			readSafeUrl,
		),
		showNetTransfer: readCustomBoolean(
			"ShowNetTransfer",
			SAKURA_DEFAULT_CONFIG.showNetTransfer,
		),
		fixedTopServerName: readCustomBoolean(
			"FixedTopServerName",
			SAKURA_DEFAULT_CONFIG.fixedTopServerName,
		),
		forceUseSvgFlag: readCustomBoolean(
			"ForceUseSvgFlag",
			SAKURA_DEFAULT_CONFIG.forceUseSvgFlag,
		),
		disableAnimatedMan: readCustomBoolean(
			"DisableAnimatedMan",
			SAKURA_DEFAULT_CONFIG.disableAnimatedMan,
		),
		forceShowServices: readCustomBoolean(
			"ForceShowServices",
			SAKURA_DEFAULT_CONFIG.forceShowServices,
		),
		forceCardInline: readCustomBoolean(
			"ForceCardInline",
			SAKURA_DEFAULT_CONFIG.forceCardInline,
		),
		forceShowMap: readCustomBoolean(
			"ForceShowMap",
			SAKURA_DEFAULT_CONFIG.forceShowMap,
		),
		forcePeakCutEnabled: readCustomBoolean(
			"ForcePeakCutEnabled",
			SAKURA_DEFAULT_CONFIG.forcePeakCutEnabled,
		),
		forceTheme: readForceTheme(window.ForceTheme),
		footerPowered: hasOwnWindowValue("CustomFooterPowered")
			? readFooterPowered(window.CustomFooterPowered)
			: SAKURA_DEFAULT_CONFIG.footerPowered,
	};
}

export function setSakuraBackgroundImage(
	newBackground: string | undefined,
): void {
	if (typeof window === "undefined") return;

	window.CustomBackgroundImage = newBackground || "";
	notifySakuraRuntimeConfigChanged();
}

export function notifySakuraRuntimeConfigChanged(): void {
	if (typeof window === "undefined") return;

	window.dispatchEvent(new Event(SAKURA_CONFIG_CHANGE_EVENT));
}

if (typeof window !== "undefined") {
	window.__sakuraSyncThemeConfig = notifySakuraRuntimeConfigChanged;
}
