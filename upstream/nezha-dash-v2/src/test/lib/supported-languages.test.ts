import { describe, expect, it } from "vitest";
import {
	FALLBACK_LANGUAGE,
	matchSupportedLanguage,
	normalizeSupportedLanguage,
	resolveInitialLanguage,
	SUPPORTED_LANGUAGES,
} from "@/lib/supported-languages";
import deTranslation from "@/locales/de/translation.json";
import enTranslation from "@/locales/en/translation.json";
import esTranslation from "@/locales/es/translation.json";
import ruTranslation from "@/locales/ru/translation.json";
import zhCNTranslation from "@/locales/zh-CN/translation.json";
import zhTWTranslation from "@/locales/zh-TW/translation.json";

describe("supported language helpers", () => {
	it("keeps Sakura limited to the six public frontend languages", () => {
		expect(SUPPORTED_LANGUAGES).toEqual([
			"zh-CN",
			"zh-TW",
			"en-US",
			"ru-RU",
			"es-ES",
			"de-DE",
		]);
	});

	it("normalizes common aliases and rejects unsupported stored languages", () => {
		expect(normalizeSupportedLanguage("zh-Hant")).toBe("zh-TW");
		expect(normalizeSupportedLanguage("zh-Hans-CN")).toBe("zh-CN");
		expect(normalizeSupportedLanguage("zh-HK-x-private")).toBe("zh-TW");
		expect(normalizeSupportedLanguage("ru")).toBe("ru-RU");
		expect(normalizeSupportedLanguage("ru-UA")).toBe("ru-RU");
		expect(normalizeSupportedLanguage("es")).toBe("es-ES");
		expect(normalizeSupportedLanguage("es-MX")).toBe("es-ES");
		expect(normalizeSupportedLanguage("de")).toBe("de-DE");
		expect(normalizeSupportedLanguage("de-AT")).toBe("de-DE");
		expect(normalizeSupportedLanguage("en-GB")).toBe("en-US");
		expect(normalizeSupportedLanguage("ta-IN")).toBe(FALLBACK_LANGUAGE);
		expect(normalizeSupportedLanguage("fr-FR")).toBe(FALLBACK_LANGUAGE);
		expect(normalizeSupportedLanguage("")).toBe(FALLBACK_LANGUAGE);
	});

	it("uses a saved choice first and otherwise follows browser language order", () => {
		expect(resolveInitialLanguage("de-DE", ["zh-CN"])).toBe("de-DE");
		expect(resolveInitialLanguage(null, ["fr-FR", "zh-HK"])).toBe("zh-TW");
		expect(resolveInitialLanguage(undefined, ["zh-Hans-CN", "en-US"])).toBe(
			"zh-CN",
		);
		expect(resolveInitialLanguage(null, ["fr-FR"])).toBe(FALLBACK_LANGUAGE);
		expect(matchSupportedLanguage("fr-FR")).toBeNull();
	});

	it("keeps every mounted Sakura route key complete in all six locales", () => {
		const translations = [
			zhCNTranslation,
			zhTWTranslation,
			enTranslation,
			ruTranslation,
			esTranslation,
			deTranslation,
		] as unknown as Record<string, unknown>[];
		const requiredKeys = [
			"Home",
			"ToggleLightMode",
			"ToggleDarkMode",
			"ToggleSystemMode",
			"TypeCommand",
			"NoResults",
			"Servers",
			"Shortcuts",
			"error.somethingWentWrong",
			"error.backendUnavailableTitle",
			"error.backendUnavailableDescription",
			"serverDetail.days",
			"serverDetail.hours",
			"serverDetail.bootTime",
			"serverDetailChart.realtime",
			"serverDetailChart.period1d",
			"serverDetailChart.period7d",
			"serverDetailChart.period30d",
			"serverDetailChart.tsdbRequired",
			"serverDetailChart.loginRequired",
			"monitor.loginRequired",
			"serviceTracker.averageDelay",
			"serviceTracker.delay",
			...SUPPORTED_LANGUAGES.map((language) => `language.${language}`),
		];
		const readKey = (translation: Record<string, unknown>, key: string) =>
			key
				.split(".")
				.reduce<unknown>(
					(value, part) =>
						value && typeof value === "object"
							? Reflect.get(value, part)
							: undefined,
					translation,
				);

		for (const translation of translations) {
			for (const key of requiredKeys) {
				expect(readKey(translation, key), key).toBeTruthy();
			}
		}
	});
});
