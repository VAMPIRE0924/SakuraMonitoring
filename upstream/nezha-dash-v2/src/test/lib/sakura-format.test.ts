import { describe, expect, it } from "vitest";
import { formatSakuraBytes } from "@/lib/sakura-format";

describe("formatSakuraBytes", () => {
	it("matches the compact byte labels used by the live Sakura detail view", () => {
		expect(formatSakuraBytes(0)).toBe("0 Bytes");
		expect(formatSakuraBytes(-1)).toBe("0 Bytes");
		expect(formatSakuraBytes(Number.NaN)).toBe("0 Bytes");
		expect(formatSakuraBytes(Number.POSITIVE_INFINITY)).toBe("0 Bytes");
		expect(formatSakuraBytes(1024 ** 3)).toBe("1 GiB");
		expect(formatSakuraBytes(5.9 * 1024 ** 3)).toBe("5.9 GiB");
	});
});
