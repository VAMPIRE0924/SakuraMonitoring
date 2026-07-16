import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	fetchLoginUser,
	fetchMonitor,
	fetchServerGroup,
	fetchServerMetrics,
	fetchService,
	fetchSetting,
	isAuthenticatedProfile,
	NezhaApiError,
} from "@/lib/nezha-api";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
	new Response(JSON.stringify(body), {
		status: init?.status ?? 200,
		statusText: init?.statusText,
		headers: {
			"Content-Type": "application/json",
			...init?.headers,
		},
	});

describe("nezha api fetchers", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	it("returns setting payloads", async () => {
		const payload = {
			success: true,
			data: {
				config: {
					debug: false,
					language: "en-US",
					site_name: "Nezha",
					user_template: "",
					admin_template: "",
					custom_code: "",
				},
				tsdb_enabled: true,
				version: "1.0.0",
			},
		};
		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

		await expect(fetchSetting()).resolves.toEqual(payload);
		expect(fetch).toHaveBeenCalledWith("/api/v1/setting");
	});

	it("normalizes the current guest setting response with omitted admin fields", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {
					config: {
						language: "zh-CN",
						site_name: "Sakura",
					},
					tsdb_enabled: true,
				},
			}),
		);

		await expect(fetchSetting()).resolves.toEqual({
			success: true,
			data: {
				config: {
					language: "zh-CN",
					site_name: "Sakura",
				},
				tsdb_enabled: true,
			},
		});
	});

	it("rejects wrong types in optional setting fields", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {
					config: {
						custom_code: 1,
						language: "en-US",
						site_name: "Nezha",
					},
					tsdb_enabled: true,
				},
			}),
		);

		await expect(fetchSetting()).rejects.toThrow("Invalid setting response");
	});

	it("rejects setting responses that omit required TSDB capability", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {
					config: {
						language: "en-US",
						site_name: "Nezha",
					},
				},
			}),
		);

		await expect(fetchSetting()).rejects.toThrow("Invalid setting response");
	});

	it("rejects malformed setting and server group payloads", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse({ success: true, data: null }))
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: [{ group: { id: 1, name: "Edge" }, servers: ["1"] }],
				}),
			);

		await expect(fetchSetting()).rejects.toThrow("Invalid setting response");
		await expect(fetchServerGroup()).rejects.toThrow(
			"Invalid server group response",
		);
	});

	it("accepts public server groups with omitted database metadata", async () => {
		const payload = {
			success: true,
			data: [{ group: { name: "Edge" }, servers: [1, 2] }],
		};
		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

		await expect(fetchServerGroup()).resolves.toEqual(payload);
		expect(fetch).toHaveBeenCalledWith("/api/v1/server-group", {
			cache: "no-store",
			credentials: "omit",
		});
	});

	it("rejects wrong types in optional server group metadata", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: [{ group: { id: "1", name: "Edge" }, servers: [1] }],
			}),
		);

		await expect(fetchServerGroup()).rejects.toThrow(
			"Invalid server group response",
		);
	});

	it("throws API error messages returned by service endpoints", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({ error: "service unavailable" }),
		);

		await expect(fetchService()).rejects.toThrow("service unavailable");
	});

	it("normalizes nested service and cycle payloads", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {
					services: {
						"1": {
							current_up: 29,
							current_down: 1,
							total_up: 290,
							total_down: 10,
							delay: [12],
							down: null,
							up: [1],
						},
						broken: { current_up: "invalid" },
					},
					cycle_transfer_stats: {
						"1": {
							name: "Monthly",
							from: "2026-07-01T00:00:00Z",
							to: "2026-08-01T00:00:00Z",
							max: 100,
							min: 0,
							server_name: { "7": "edge" },
							transfer: { "7": 50 },
						},
						broken: { name: "Broken", transfer: { "7": "invalid" } },
					},
				},
			}),
		);

		await expect(fetchService()).resolves.toMatchObject({
			data: {
				services: {
					"1": { service_name: "1", delay: [12], up: [1], down: [] },
				},
				cycle_transfer_stats: {
					"1": { max: 100, transfer: { "7": 50 } },
				},
			},
		});
	});

	it("rejects failed HTTP and non-JSON responses", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(
				jsonResponse({}, { status: 503, statusText: "Unavailable" }),
			)
			.mockResolvedValueOnce(new Response("not json", { status: 502 }));

		await expect(fetchSetting()).rejects.toThrow("Request failed (503)");
		await expect(fetchService()).rejects.toThrow("Invalid JSON response (502)");
	});

	it("adds monitor and metrics query parameters when periods are provided", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: {
						server_id: 7,
						server_name: "edge",
						metric: "cpu",
						data_points: [],
					},
				}),
			);

		await fetchMonitor(7, "7d");
		await fetchServerMetrics(7, "cpu", "30d");

		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"/api/v1/server/7/service?period=7d",
		);
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			"/api/v1/server/7/metrics?metric=cpu&period=30d",
		);
	});

	it("drops malformed monitor records and metrics points at the API boundary", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: [
						{
							monitor_id: 1,
							monitor_name: "HTTP",
							server_id: 7,
							server_name: "edge",
							created_at: [1, 2, 3],
							avg_delay: [10, 20],
						},
						{
							monitor_id: 2,
							monitor_name: "Broken",
							server_id: 7,
							server_name: "edge",
							created_at: [1],
							avg_delay: ["invalid"],
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: {
						server_id: 7,
						server_name: "edge",
						metric: "cpu",
						data_points: [
							{ ts: 1, value: 20 },
							{ ts: 2, value: Number.NaN },
							null,
						],
					},
				}),
			);

		await expect(fetchMonitor(7)).resolves.toMatchObject({
			data: [{ created_at: [1, 2], avg_delay: [10, 20] }],
		});
		await expect(fetchServerMetrics(7, "cpu")).resolves.toMatchObject({
			data: { data_points: [{ ts: 1, value: 20 }] },
		});
	});

	it("treats an empty optional packet-loss series as absent", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: [
					{
						monitor_id: 1,
						monitor_name: "HTTP",
						server_id: 7,
						server_name: "edge",
						created_at: [1, 2],
						avg_delay: [10, 20],
						packet_loss: [],
					},
				],
			}),
		);

		await expect(fetchMonitor(7)).resolves.toMatchObject({
			data: [{ created_at: [1, 2], avg_delay: [10, 20] }],
		});
	});

	it("rejects malformed profile, monitor, and metrics payloads", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse({ success: true, data: null }))
			.mockResolvedValueOnce(jsonResponse({ success: true, data: null }))
			.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

		await expect(fetchLoginUser()).rejects.toThrow("Invalid profile response");
		await expect(fetchMonitor(7)).rejects.toThrow("Invalid monitor response");
		await expect(fetchServerMetrics(7, "cpu")).rejects.toThrow(
			"Invalid metrics response",
		);
	});

	it("rejects non-positive API resource IDs", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 0 } }))
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: [
						{
							monitor_id: -1,
							monitor_name: "HTTP",
							server_id: 7,
							server_name: "edge",
							created_at: [1],
							avg_delay: [10],
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: {
						server_id: 0,
						server_name: "edge",
						metric: "cpu",
						data_points: [],
					},
				}),
			);

		await expect(fetchLoginUser()).rejects.toThrow("Invalid profile response");
		await expect(fetchMonitor(7)).resolves.toEqual({ success: true, data: [] });
		await expect(fetchServerMetrics(7, "cpu")).rejects.toThrow(
			"Invalid metrics response",
		);
	});

	it("derives authentication only from a successful validated profile", () => {
		expect(isAuthenticatedProfile(undefined)).toBe(false);
		expect(isAuthenticatedProfile({ success: false, data: { id: 1 } })).toBe(
			false,
		);
		expect(isAuthenticatedProfile({ success: true, data: { id: 1 } })).toBe(
			true,
		);
		expect(
			isAuthenticatedProfile(
				{ success: true, data: { id: 1 } },
				new NezhaApiError("expired", 401),
			),
		).toBe(false);
		expect(
			isAuthenticatedProfile(
				{ success: true, data: { id: 1 } },
				new NezhaApiError("temporary", 503),
			),
		).toBe(true);
	});

	it("passes an optional abort signal to metrics requests", async () => {
		const controller = new AbortController();
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {
					server_id: 7,
					server_name: "edge",
					metric: "cpu",
					data_points: [],
				},
			}),
		);

		await fetchServerMetrics(7, "cpu", "1d", controller.signal);

		expect(fetch).toHaveBeenCalledWith(
			"/api/v1/server/7/metrics?metric=cpu&period=1d",
			{ signal: controller.signal },
		);
	});

	it("passes an optional abort signal to shared dashboard requests", async () => {
		const controller = new AbortController();
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: { services: {}, cycle_transfer_stats: {} },
			}),
		);

		await fetchService(controller.signal);

		expect(fetch).toHaveBeenCalledWith("/api/v1/service", {
			signal: controller.signal,
		});
	});

	it("refreshes the token when a logged-in browser session has cookies", async () => {
		const consoleLog = vi
			.spyOn(console, "log")
			.mockImplementation(() => undefined);
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "nezha_token=token; nz-csrf=test-csrf-token",
		});
		const payload = {
			success: true,
			data: {
				id: 1,
				username: "admin",
				password: "",
				created_at: "2025-01-01T00:00:00Z",
				updated_at: "2025-01-01T00:00:00Z",
			},
		};
		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse(payload))
			.mockResolvedValueOnce(jsonResponse({ success: true }));

		await expect(fetchLoginUser()).resolves.toEqual({
			success: true,
			data: { id: 1 },
		});

		expect(fetch).toHaveBeenNthCalledWith(1, "/api/v1/profile");
		expect(fetch).toHaveBeenNthCalledWith(2, "/api/v1/refresh-token", {
			method: "POST",
			headers: {
				"X-CSRF-Token": "test-csrf-token",
			},
		});
		expect(consoleLog).not.toHaveBeenCalled();
	});

	it("does not refresh a token without a CSRF cookie", async () => {
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "nezha_token=token",
		});
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: { id: 1 },
			}),
		);

		await fetchLoginUser();

		expect(fetch).toHaveBeenCalledOnce();
	});

	it("does not refresh a token for an unsuccessful profile response", async () => {
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "nezha_token=token; nz-csrf=test-csrf-token",
		});
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: false,
				data: { id: 1 },
			}),
		);

		await expect(fetchLoginUser()).resolves.toEqual({
			success: false,
			data: { id: 1 },
		});
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("ignores malformed encoded CSRF cookies", async () => {
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "nezha_token=token; nz-csrf=%E0%A4%A",
		});
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: { id: 1 },
			}),
		);

		await expect(fetchLoginUser()).resolves.toMatchObject({ success: true });
		expect(fetch).toHaveBeenCalledOnce();
	});
});
