import { describe, expect, it } from "vitest";
import { buildServiceSummaries } from "@/lib/service-summary";
import {
	appendRateSample,
	buildCycleTransfers,
	buildServerViews,
	getOverviewTotals,
	pickDisplayPlatform,
} from "@/sakura/sakura-data";
import { createServer } from "@/test/fixtures";
import type { CycleTransferStats, ServiceResponse } from "@/types/nezha-api";

const translate = (key: string) => key;

describe("Sakura data adapters", () => {
	it("normalizes display platforms from official host fields", () => {
		expect(pickDisplayPlatform("linux", "Debian GNU/Linux 12 (bookworm)")).toBe(
			"Debian",
		);
		expect(pickDisplayPlatform("linux", "OpenWrt 23.05")).toBe("OpenWrt");
		expect(pickDisplayPlatform("linux", "6.8.0-64-generic")).toBe("Linux");
		expect(pickDisplayPlatform("windows", "10.0.20348")).toBe("Windows");
	});

	it("keeps cycle-transfer data compatible with official service payloads", () => {
		const stats: CycleTransferStats = {
			metered: {
				name: "Monthly",
				from: "2025-01-01T00:00:00.000Z",
				to: "2025-02-01T00:00:00.000Z",
				max: 1000,
				min: 0,
				next_update: {
					"1": "2025-02-01T00:00:00.000Z",
				},
				server_name: {
					"1": "edge-metered",
				},
				transfer: {
					"1": 250,
				},
			},
			unlimited: {
				name: "Monthly",
				from: "2025-01-01T00:00:00.000Z",
				to: "2025-02-01T00:00:00.000Z",
				max: -1,
				min: 0,
				next_update: {
					"2": "2025-02-01T00:00:00.000Z",
				},
				server_name: {
					"2": "edge-infinite",
				},
				transfer: {
					"2": 2048,
				},
			},
		};

		const transfers = buildCycleTransfers(stats);

		expect(transfers["1"]).toMatchObject({
			infinite: false,
			name: "Monthly",
			percent: 25,
			serverId: "1",
			total: 1000,
			used: 250,
		});
		expect(transfers["2"]).toMatchObject({
			infinite: true,
			name: "Monthly",
			percent: 100,
			serverId: "2",
			total: Number.POSITIVE_INFINITY,
			used: 2048,
		});
	});

	it("builds server views with billing, tags, cycle blocks, and online-only totals", () => {
		const publicNote = JSON.stringify({
			billingDataMod: {
				amount: "-1",
				autoRenewal: "",
				cycle: "monthly",
				endDate: "0000-00-00",
				startDate: "2025-01-01",
			},
			planDataMod: {
				bandwidth: "1Gbps",
				extra: "Backup, Premium",
				IPv4: "1",
				IPv6: "1",
				networkRoute: "AS4809, CN2",
				trafficType: "",
				trafficVol: "2TB",
			},
		});
		const online = createServer({
			id: 1,
			name: "edge-online",
			public_note: publicNote,
			state: {
				net_in_speed: 10,
				net_in_transfer: 100,
				net_out_speed: 20,
				net_out_transfer: 200,
			},
		});
		const offline = createServer({
			id: 2,
			name: "edge-offline",
			last_active: "2024-12-31T20:00:00.000Z",
			state: {
				net_in_speed: 1000,
				net_in_transfer: 1000,
				net_out_speed: 1000,
				net_out_transfer: 1000,
			},
		});

		const views = buildServerViews({
			cycles: {
				"1": {
					infinite: true,
					name: "Monthly",
					percent: 100,
					serverId: "1",
					total: Number.POSITIVE_INFINITY,
					used: 1024,
				},
			},
			now: Date.parse("2025-01-01T00:00:20.000Z"),
			servers: [online, offline],
			translate,
		});

		expect(views[0].billing).toMatchObject({
			amountLabel: "billingInfo.usage-baseed",
			daysLabel: "billingInfo.remaining: billingInfo.indefinite",
			isNeverExpire: true,
		});
		expect(views[0].cycle?.infinite).toBe(true);
		expect(views[0].planTags.map((tag) => tag.label)).toEqual([
			"1Gbps",
			"2TB",
			"IPv4",
			"IPv6",
			"AS4809",
			"CN2",
		]);

		expect(getOverviewTotals(views)).toMatchObject({
			downSpeed: 10,
			downTransfer: 100,
			offline: 1,
			online: 1,
			total: 2,
			upSpeed: 20,
			upTransfer: 200,
		});
	});

	it("matches official service-day status semantics", () => {
		const serviceData: ServiceResponse["data"]["services"] = {
			"1": {
				current_down: 0,
				current_up: 1,
				delay: [24, 0, 80],
				down: [0, 0, 2],
				service_name: "HTTPS",
				total_down: 2,
				total_up: 11,
				up: [10, 0, 1],
			},
		};

		const [summary] = buildServiceSummaries(serviceData);

		expect(summary.name).toBe("HTTPS");
		expect(summary.avgDelay).toBeCloseTo(34.67, 2);
		expect(summary.uptime).toBeCloseTo(84.62, 2);
		expect(summary.days).toHaveLength(30);
		expect(summary.days.slice(0, 27).every((day) => day.missing)).toBe(true);
		expect(summary.days.slice(-3).map((day) => day.completed)).toEqual([
			true,
			false,
			false,
		]);
		expect(summary.days.slice(-3).map((day) => day.uptime)).toEqual([
			100, 0, 33.33333333333333,
		]);
	});

	it("clamps negative service samples after API validation", () => {
		const [summary] = buildServiceSummaries({
			"9": {
				current_down: 0,
				current_up: 1,
				delay: [12, -4],
				down: [0],
				service_name: "9",
				total_down: 0,
				total_up: 1,
				up: [1, 0, -2],
			},
		});

		expect(summary.name).toBe("9");
		expect(summary.avgDelay).toBe(6);
		expect(summary.uptime).toBe(100);
		expect(summary.days).toHaveLength(30);
		expect(summary.days.slice(-3).map((day) => day.uptime)).toEqual([
			100, 0, 0,
		]);
	});

	it("right-aligns unequal service history arrays to the latest days", () => {
		const [summary] = buildServiceSummaries({
			"10": {
				current_down: 0,
				current_up: 1,
				delay: [20, 30],
				down: [10],
				service_name: "Uneven",
				total_down: 10,
				total_up: 30,
				up: [10, 10, 10],
			},
		});

		expect(summary.days.slice(-3).map((day) => day.uptime)).toEqual([
			100, 100, 50,
		]);
		expect(summary.days.slice(-3).map((day) => day.delay)).toEqual([0, 20, 30]);
	});

	it("samples overview rate history in a 30-minute two-second window", () => {
		const startedAt = 1_000;
		const initial = appendRateSample([], { down: -2, t: startedAt, up: 10 });
		expect(initial).toEqual([{ down: 0, t: startedAt, up: 10 }]);

		const updated = appendRateSample(initial, {
			down: 4,
			t: startedAt + 1000,
			up: 20,
		});
		expect(updated).toEqual([{ down: 4, t: startedAt + 1000, up: 20 }]);

		const appended = appendRateSample(updated, {
			down: 8,
			t: startedAt + 3000,
			up: 40,
		});
		expect(appended).toEqual([
			{ down: 4, t: startedAt + 1000, up: 20 },
			{ down: 8, t: startedAt + 3000, up: 40 },
		]);

		const clockAdjusted = appendRateSample(appended, {
			down: 6,
			t: startedAt + 2000,
			up: 30,
		});
		expect(clockAdjusted).toEqual([{ down: 6, t: startedAt + 2000, up: 30 }]);

		const pruned = appendRateSample(appended, {
			down: 16,
			t: startedAt + 30 * 60 * 1000 + 3001,
			up: 80,
		});
		expect(pruned).toEqual([
			{ down: 16, t: startedAt + 30 * 60 * 1000 + 3001, up: 80 },
		]);
	});
});
