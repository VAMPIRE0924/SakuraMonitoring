import { describe, expect, it } from "vitest";
import de from "@/locales/de/translation.json";
import en from "@/locales/en/translation.json";
import es from "@/locales/es/translation.json";
import ru from "@/locales/ru/translation.json";
import zhCN from "@/locales/zh-CN/translation.json";
import zhTW from "@/locales/zh-TW/translation.json";

const translations = { de, en, es, ru, zhCN, zhTW } as const;

describe("Sakura i18n controls", () => {
	it.each(
		Object.entries(translations),
	)("defines shared controls in %s", (_language, translation) => {
		expect(Object.values(translation.common)).not.toContain("");
		expect(Object.keys(translation.common)).toEqual(Object.keys(en.common));
		expect(Object.values(translation.controls)).not.toContain("");
		expect(Object.keys(translation.controls)).toEqual(Object.keys(en.controls));
		expect(Object.keys(translation.sort)).toEqual(Object.keys(en.sort));
	});
});
