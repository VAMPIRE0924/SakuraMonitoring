import { describe, expect, it } from "vitest";

import { formatBytes, formatRate } from "@/lib/format";

describe("formatBytes", () => {
	it("formats empty byte values as zero KiB", () => {
		expect(formatBytes(0)).toBe("0 KiB");
		expect(formatBytes(-1)).toBe("0 KiB");
		expect(formatBytes(Number.NaN)).toBe("0 KiB");
		expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 KiB");
	});

	it("keeps byte values in binary units", () => {
		expect(formatBytes(512)).toBe("0.50 KiB");
		expect(formatBytes(1024)).toBe("1.00 KiB");
		expect(formatBytes(1024 ** 2)).toBe("1.00 MiB");
		expect(formatBytes(1024 ** 3 * 2.5, 1)).toBe("2.5 GiB");
		expect(formatBytes(Number.MAX_VALUE)).not.toContain("undefined");
		expect(formatBytes(Number.MAX_VALUE)).toMatch(/ YiB$/);
	});

	it("clamps negative decimal precision to an integer", () => {
		expect(formatBytes(1536, -1)).toBe("2 KiB");
	});

	it("formats transfer rates through the shared byte formatter", () => {
		expect(formatRate(1024 ** 2)).toBe("1.00 MiB/s");
		expect(formatRate(Number.NaN)).toBe("0 KiB/s");
	});
});
