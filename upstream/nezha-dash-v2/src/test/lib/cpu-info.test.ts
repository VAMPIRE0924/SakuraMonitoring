import { describe, expect, it } from "vitest";
import { extractCpuCoreCount } from "@/lib/cpu-info";

describe("extractCpuCoreCount", () => {
	it.each([
		[["Intel(R) Xeon(R) CPU E5-2696 v4 @ 2.20GHz 12 Physical Core"], 12],
		[["AMD EPYC 7K83 64-Core Processor 2 Virtual Core"], 2],
		[["Neoverse-N1 3 Virtual Core"], 3],
		[["AMD EPYC vCPU: 2"], 2],
		[["4C/8T AMD Ryzen"], 4],
		[["Physical Cores: 6"], 6],
		[["8 \u903B\u8F91\u6838\u5FC3"], 8],
		[["2 x Intel Xeon 8-Core Processor"], 16],
	])("parses supported CPU descriptions", (value, expected) => {
		expect(extractCpuCoreCount(value)).toBe(expected);
	});

	it("adds explicit counts reported for multiple sockets", () => {
		expect(
			extractCpuCoreCount([
				"Intel Xeon 2 Physical Cores",
				"Intel Xeon 2 Physical Cores",
			]),
		).toBe(4);
	});

	it("uses per-entry agent data when model strings have no count", () => {
		expect(
			extractCpuCoreCount([
				"Intel Xeon Gold 6133",
				"Intel Xeon Gold 6133",
				"Intel Xeon Gold 6133",
				"Intel Xeon Gold 6133",
			]),
		).toBe(4);
	});

	it("does not invent a count from a single model-only string", () => {
		expect(extractCpuCoreCount(["ARM Neoverse-N1"])).toBeUndefined();
		expect(extractCpuCoreCount([])).toBeUndefined();
	});
});
