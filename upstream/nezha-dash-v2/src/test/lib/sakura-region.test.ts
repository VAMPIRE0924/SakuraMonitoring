import { describe, expect, it } from "vitest";
import {
	displaySakuraRegionName,
	neutralSakuraRegionName,
} from "@/lib/sakura-region";

describe("Sakura region names", () => {
	it("uses short neutral names for explicitly normalized regions", () => {
		expect(displaySakuraRegionName("CN", "zh-CN")).toBe("中国");
		expect(displaySakuraRegionName("KR", "zh-CN")).toBe("韩国");
		expect(displaySakuraRegionName("KP", "zh-CN")).toBe("朝鲜");
		expect(displaySakuraRegionName("HK", "zh-CN")).toBe("香港");
		expect(displaySakuraRegionName("MO", "zh-CN")).toBe("澳门");
		expect(displaySakuraRegionName("TW", "zh-CN")).toBe("台湾");
		expect(displaySakuraRegionName("TW", "en")).toBe("Taiwan");
		expect(displaySakuraRegionName("TW", "ru")).toBe("Тайвань");
		expect(displaySakuraRegionName("CN", "ru")).toBe("Китай");
		expect(displaySakuraRegionName("KR", "ru")).toBe("Южная Корея");
		expect(displaySakuraRegionName("KP", "ru")).toBe("Северная Корея");
	});

	it("returns no override for ordinary country codes", () => {
		expect(neutralSakuraRegionName("US", "en")).toBeUndefined();
		expect(displaySakuraRegionName("US", "en")).toBe("United States");
	});
});
