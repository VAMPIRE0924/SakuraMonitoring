type SakuraRegionLanguage = "de" | "en" | "es" | "ru" | "zh-CN" | "zh-TW";

const neutralRegionNames: Record<
	SakuraRegionLanguage,
	Record<string, string>
> = {
	de: {
		CN: "China",
		HK: "Hongkong",
		KP: "Nordkorea",
		KR: "Südkorea",
		MO: "Macau",
		TW: "Taiwan",
	},
	en: {
		CN: "China",
		HK: "Hong Kong",
		KP: "North Korea",
		KR: "South Korea",
		MO: "Macao",
		TW: "Taiwan",
	},
	es: {
		CN: "China",
		HK: "Hong Kong",
		KP: "Corea del Norte",
		KR: "Corea del Sur",
		MO: "Macao",
		TW: "Taiwán",
	},
	ru: {
		CN: "Китай",
		HK: "Гонконг",
		KP: "Северная Корея",
		KR: "Южная Корея",
		MO: "Макао",
		TW: "Тайвань",
	},
	"zh-CN": {
		CN: "中国",
		HK: "香港",
		KP: "朝鲜",
		KR: "韩国",
		MO: "澳门",
		TW: "台湾",
	},
	"zh-TW": {
		CN: "中國",
		HK: "香港",
		KP: "朝鮮",
		KR: "韓國",
		MO: "澳門",
		TW: "台灣",
	},
};

function supportedLanguage(language: string): SakuraRegionLanguage {
	const normalized = language.toLowerCase();
	if (normalized.startsWith("zh-tw") || normalized.startsWith("zh-hant")) {
		return "zh-TW";
	}
	if (normalized.startsWith("zh")) return "zh-CN";
	if (normalized.startsWith("de")) return "de";
	if (normalized.startsWith("es")) return "es";
	if (normalized.startsWith("ru")) return "ru";
	return "en";
}

export function neutralSakuraRegionName(
	countryCode: string,
	language: string,
): string | undefined {
	const code = countryCode.trim().toUpperCase();
	return neutralRegionNames[supportedLanguage(language)][code];
}

export function displaySakuraRegionName(
	countryCode: string,
	language: string,
): string {
	const code = countryCode.trim().toUpperCase();
	const neutralName = neutralSakuraRegionName(code, language);
	if (neutralName) return neutralName;

	try {
		return (
			new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code
		);
	} catch {
		return code;
	}
}
