import { describe, expect, it } from "vitest";
import {
	getServiceNameForPanel,
	parseServiceName,
} from "@/lib/service-visibility";

describe("service visibility markers", () => {
	it.each([
		["Cloudflare[network]", "network", "Cloudflare"],
		["  AS4809 [NETWORK]  ", "network", "AS4809"],
		["Reverse Proxy[service]", "service", "Reverse Proxy"],
		["Mail [Service] ", "service", "Mail"],
		["Legacy Monitor", "default", "Legacy Monitor"],
		["[network] Cloudflare", "default", "[network] Cloudflare"],
		["Cloudflare [network] Probe", "default", "Cloudflare [network] Probe"],
	] as const)("parses %s", (input, visibility, name) => {
		expect(parseServiceName(input)).toEqual({ name, visibility });
	});

	it("keeps unmarked monitors in both panels", () => {
		expect(getServiceNameForPanel("Legacy Monitor", "service")).toBe(
			"Legacy Monitor",
		);
		expect(getServiceNameForPanel("Legacy Monitor", "network")).toBe(
			"Legacy Monitor",
		);
	});

	it("isolates explicitly marked monitors", () => {
		expect(getServiceNameForPanel("Cloudflare[network]", "service")).toBeNull();
		expect(getServiceNameForPanel("Cloudflare[network]", "network")).toBe(
			"Cloudflare",
		);
		expect(getServiceNameForPanel("Reverse Proxy[service]", "service")).toBe(
			"Reverse Proxy",
		);
		expect(
			getServiceNameForPanel("Reverse Proxy[service]", "network"),
		).toBeNull();
	});

	it("uses only the final marker", () => {
		expect(parseServiceName("Probe[service][network]")).toEqual({
			name: "Probe[service]",
			visibility: "network",
		});
	});

	it("never exposes a marker-only name", () => {
		expect(getServiceNameForPanel("[network]", "network")).toBe("");
		expect(getServiceNameForPanel("[network]", "service")).toBeNull();
		expect(getServiceNameForPanel("[service]   ", "service")).toBe("");
		expect(getServiceNameForPanel("[service]   ", "network")).toBeNull();
	});
});
