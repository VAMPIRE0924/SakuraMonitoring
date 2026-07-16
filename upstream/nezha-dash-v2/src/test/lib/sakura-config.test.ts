import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getSakuraRuntimeConfig,
	notifySakuraRuntimeConfigChanged,
	readSafeUrl,
	resetSakuraRuntimeConfigOverrides,
	SAKURA_CONFIG_CHANGE_EVENT,
	SAKURA_DEFAULT_CONFIG,
	setSakuraBackgroundImage,
} from "@/lib/sakura-config";

describe("sakura runtime config", () => {
	beforeEach(() => {
		for (const key of [
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
		]) {
			Reflect.deleteProperty(window, key);
		}
	});

	it("uses Sakura local defaults until public custom code overrides them", () => {
		const config = getSakuraRuntimeConfig();

		expect(config).toMatchObject(SAKURA_DEFAULT_CONFIG);
	});

	it("clears previous custom-code globals before applying a replacement", () => {
		Object.assign(window, {
			CustomLogo: "/old-logo.svg",
			CustomDesc: "Old description",
			ForceSortType: "cpu",
		});

		resetSakuraRuntimeConfigOverrides();

		expect(getSakuraRuntimeConfig()).toMatchObject(SAKURA_DEFAULT_CONFIG);
		expect(window.CustomLogo).toBeUndefined();
		expect(window.CustomDesc).toBeUndefined();
		expect(window.ForceSortType).toBeUndefined();
	});

	it("treats empty public custom-code fields as explicit clears", () => {
		Object.assign(window, {
			CustomBackgroundImage: "",
			CustomMobileBackgroundImage: "",
			CustomTitle: "",
			CustomLogo: "",
			CustomFavicon: "",
			CustomDesc: "",
			CustomIllustration: "",
			CustomLoadingIllustration: "",
			CustomFooterPowered: {
				show: false,
				prefix: "",
				name: "",
				url: "",
			},
		});

		const config = getSakuraRuntimeConfig();

		expect(config.backgroundImage).toBe("");
		expect(config.mobileBackgroundImage).toBe("");
		expect(config.title).toBe("");
		expect(config.logo).toBe("");
		expect(config.favicon).toBe("");
		expect(config.description).toBe("");
		expect(config.illustration).toBe("");
		expect(config.loadingIllustration).toBe("");
		expect(config.footerPowered.show).toBe(false);
	});

	it("normalizes optional custom code settings", () => {
		Object.assign(window, {
			CustomBackgroundImage: " /desktop.jpg ",
			CustomMobileBackgroundImage: " /mobile.jpg ",
			CustomTitle: " Sakura Title ",
			CustomLogo: " /logo.svg ",
			CustomFavicon: " /favicon.ico ",
			CustomDesc: " Sakura ",
			CustomLinks: '[{"name":"Docs","link":"https://example.test"}]',
			CustomIllustration: " /illu.webp ",
			CustomLoadingIllustration: " /loading.gif ",
			ShowNetTransfer: true,
			FixedTopServerName: true,
			ForceUseSvgFlag: true,
			DisableAnimatedMan: true,
			ForceTheme: "dark",
			CustomFooterPowered: {
				show: true,
				prefix: "Powered by",
				name: "VAMPIRE",
				url: "https://example.test",
			},
		});

		const config = getSakuraRuntimeConfig();

		expect(config.backgroundImage).toBe("/desktop.jpg");
		expect(config.mobileBackgroundImage).toBe("/mobile.jpg");
		expect(config.title).toBe("Sakura Title");
		expect(config.logo).toBe("/logo.svg");
		expect(config.favicon).toBe("/favicon.ico");
		expect(config.description).toBe("Sakura");
		expect(config.links).toContain("Docs");
		expect(config.illustration).toBe("/illu.webp");
		expect(config.loadingIllustration).toBe("/loading.gif");
		expect(config.showNetTransfer).toBe(true);
		expect(config.fixedTopServerName).toBe(true);
		expect(config.forceUseSvgFlag).toBe(true);
		expect(config.disableAnimatedMan).toBe(true);
		expect(config.forceTheme).toBe("dark");
		expect(config.footerPowered).toEqual({
			show: true,
			prefix: "Powered by",
			name: "VAMPIRE",
			url: "https://example.test",
		});
	});

	it("falls back to theme defaults for invalid custom boolean values", () => {
		Object.assign(window, {
			ShowNetTransfer: undefined,
			FixedTopServerName: "true",
			ForceUseSvgFlag: 1,
			DisableAnimatedMan: null,
			ForceShowServices: "false",
			ForceCardInline: 0,
			ForceShowMap: {},
			ForcePeakCutEnabled: [],
		});

		const config = getSakuraRuntimeConfig();

		for (const key of [
			"showNetTransfer",
			"fixedTopServerName",
			"forceUseSvgFlag",
			"disableAnimatedMan",
			"forceShowServices",
			"forceCardInline",
			"forceShowMap",
			"forcePeakCutEnabled",
		] as const) {
			expect(config[key]).toBe(SAKURA_DEFAULT_CONFIG[key]);
		}
	});

	it("rejects unsafe footer links from public custom code", () => {
		Object.assign(window, {
			CustomFooterPowered: {
				show: true,
				prefix: "Powered by",
				name: "VAMPIRE",
				url: " javascript:alert(1) ",
			},
		});

		expect(getSakuraRuntimeConfig().footerPowered).toEqual({
			show: true,
			prefix: "Powered by",
			name: "VAMPIRE",
			url: "",
		});
	});

	it("preserves explicit footer clears and inherits omitted fields", () => {
		window.CustomFooterPowered = {
			prefix: "",
			name: "",
		};

		expect(getSakuraRuntimeConfig().footerPowered).toEqual({
			show: true,
			prefix: "",
			name: "",
			url: SAKURA_DEFAULT_CONFIG.footerPowered.url,
		});
	});

	it("accepts only safe http URLs for public custom-code assets", () => {
		expect(readSafeUrl(" /sakura.jpg ")).toBe("/sakura.jpg");
		expect(readSafeUrl(" https://example.test/sakura.jpg ")).toBe(
			"https://example.test/sakura.jpg",
		);
		expect(readSafeUrl("javascript:alert(1)")).toBe("");
		expect(readSafeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
		expect(readSafeUrl('https://example.test/logo.svg"\n')).toBe("");

		Object.assign(window, {
			CustomBackgroundImage: "javascript:alert(1)",
			CustomMobileBackgroundImage: 'https://example.test/mobile.jpg"',
			CustomLogo: "data:text/html,<script>alert(1)</script>",
			CustomFavicon: "vbscript:alert(1)",
			CustomIllustration: "https://example.test/illu.webp",
			CustomLoadingIllustration: "https://example.test/loading.gif",
		});

		const config = getSakuraRuntimeConfig();

		expect(config.backgroundImage).toBe("");
		expect(config.mobileBackgroundImage).toBe("");
		expect(config.logo).toBe("");
		expect(config.favicon).toBe("");
		expect(config.illustration).toBe("https://example.test/illu.webp");
		expect(config.loadingIllustration).toBe("https://example.test/loading.gif");

		window.CustomBackgroundImage = "/safe-sakura.jpg";
		expect(getSakuraRuntimeConfig().backgroundImage).toBe("/safe-sakura.jpg");
	});

	it("broadcasts config changes", () => {
		const configListener = vi.fn();
		window.addEventListener(SAKURA_CONFIG_CHANGE_EVENT, configListener);

		setSakuraBackgroundImage("/next.jpg");

		expect(window.CustomBackgroundImage).toBe("/next.jpg");
		expect(configListener).toHaveBeenCalledOnce();

		notifySakuraRuntimeConfigChanged();

		expect(configListener).toHaveBeenCalledTimes(2);
		window.removeEventListener(SAKURA_CONFIG_CHANGE_EVENT, configListener);
	});
});
