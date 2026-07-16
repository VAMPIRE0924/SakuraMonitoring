import worldMap from "@rembish/iso-topojson";
import { geoArea, geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";

type TopologyObject = Parameters<typeof feature>[1];
type WorldTopology = Parameters<typeof feature>[0] & {
	objects: { merged: TopologyObject };
};

interface WorldCountryProperties {
	iso_a2_eh: string;
	iso_a3_eh: string;
	name: string;
}

export type WorldCountryFeature = Feature<Geometry, WorldCountryProperties>;

export interface WorldCountryMarker {
	feature: WorldCountryFeature;
	lat: number;
	lng: number;
}

const worldTopology = worldMap as unknown as WorldTopology;
const worldTopologyObject = worldTopology.objects.merged;

const decodedCountries = feature(
	worldTopology,
	worldTopologyObject,
) as unknown as FeatureCollection<
	Geometry,
	{ iso_a2: string; iso_a3: string | null; name: string }
>;

export const worldCountryFeatures: WorldCountryFeature[] =
	decodedCountries.features.map((country) => ({
		...country,
		properties: {
			iso_a2_eh: country.properties.iso_a2.toUpperCase(),
			iso_a3_eh: country.properties.iso_a3 ?? "",
			name: country.properties.name,
		},
	}));

const TINY_COUNTRY_AREA = 0.00004;

// Tiny territories keep their real polygon, with a small interaction target layered above it.
export const worldCountryMarkers: WorldCountryMarker[] = worldCountryFeatures
	.filter((country) => geoArea(country) < TINY_COUNTRY_AREA)
	.map((feature) => {
		const [lng, lat] = geoCentroid(feature);
		return { feature, lat, lng };
	});
