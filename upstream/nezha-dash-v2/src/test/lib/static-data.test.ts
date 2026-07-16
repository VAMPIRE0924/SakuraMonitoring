import { describe, expect, it } from "vitest";

import { worldCountryFeatures, worldCountryMarkers } from "@/lib/world-map";

describe("static geographic data", () => {
	it("ships a complete ISO polygon map with separate Asian regions", () => {
		const codes = new Set(
			worldCountryFeatures.map((feature) => feature.properties.iso_a2_eh),
		);

		expect(worldCountryFeatures).toHaveLength(250);
		for (const code of ["CN", "HK", "MO", "SG", "TW", "US"]) {
			expect(codes.has(code)).toBe(true);
		}
		expect(
			worldCountryFeatures.every((feature) =>
				["Polygon", "MultiPolygon"].includes(feature.geometry.type),
			),
		).toBe(true);
	});

	it("adds interaction markers only for tiny countries and territories", () => {
		const markerCodes = new Set(
			worldCountryMarkers.map((marker) => marker.feature.properties.iso_a2_eh),
		);

		for (const code of ["SG", "HK", "MO", "VA", "MC"]) {
			expect(markerCodes.has(code)).toBe(true);
		}
		expect(markerCodes.has("CN")).toBe(false);
		expect(markerCodes.has("US")).toBe(false);
	});
});
