export const FALLBACK_LANGUAGE = "en-US";

export const SUPPORTED_LANGUAGES = [
	"zh-CN",
	"zh-TW",
	"en-US",
	"ru-RU",
	"es-ES",
	"de-DE",
] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function matchSupportedLanguage(
	value: unknown,
): SupportedLanguage | null {
	const language = typeof value === "string" ? value.trim().toLowerCase() : "";

	if (
		language.startsWith("zh-tw") ||
		language.startsWith("zh-hk") ||
		language.startsWith("zh-mo") ||
		language.includes("hant") ||
		language === "hant"
	) {
		return "zh-TW";
	}
	if (language === "zh" || language.startsWith("zh-")) return "zh-CN";
	if (language === "ru" || language.startsWith("ru-")) return "ru-RU";
	if (language === "es" || language.startsWith("es-")) return "es-ES";
	if (language === "de" || language.startsWith("de-")) return "de-DE";
	if (language === "en" || language.startsWith("en-")) return "en-US";

	return null;
}

export function normalizeSupportedLanguage(value: unknown): SupportedLanguage {
	return matchSupportedLanguage(value) ?? FALLBACK_LANGUAGE;
}

export function resolveInitialLanguage(
	storedLanguage: unknown,
	browserLanguages: readonly unknown[] = [],
): SupportedLanguage {
	const stored = matchSupportedLanguage(storedLanguage);
	if (stored) return stored;

	for (const browserLanguage of browserLanguages) {
		const language = matchSupportedLanguage(browserLanguage);
		if (language) return language;
	}

	return FALLBACK_LANGUAGE;
}
