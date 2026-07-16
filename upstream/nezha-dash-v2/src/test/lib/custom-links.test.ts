import { describe, expect, it } from "vitest";
import { parseCustomLinks } from "@/lib/custom-links";

describe("parseCustomLinks", () => {
	it("keeps safe absolute and site-relative links", () => {
		expect(
			parseCustomLinks(
				JSON.stringify([
					{ link: "https://example.com/status", name: " Status " },
					{ link: "/docs", name: "Docs" },
				]),
			),
		).toEqual([
			{ link: "https://example.com/status", name: "Status" },
			{ link: "/docs", name: "Docs" },
		]);
	});

	it("rejects executable, malformed, and incomplete entries", () => {
		expect(
			parseCustomLinks(
				JSON.stringify([
					{ link: "javascript:alert(1)", name: "Unsafe" },
					{ link: "data:text/html,test", name: "Unsafe data" },
					{ link: "https://example.com\ninvalid", name: "Malformed" },
					{ link: "https://example.com", name: " " },
				]),
			),
		).toEqual([]);
	});

	it("returns an empty list for non-array or invalid JSON input", () => {
		expect(parseCustomLinks("{}")).toEqual([]);
		expect(parseCustomLinks("not json")).toEqual([]);
		expect(parseCustomLinks(undefined)).toEqual([]);
	});
});
