import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchServerOnlineHistory,
	isUnauthorizedError,
	NezhaApiError,
} from "@/lib/nezha-api";

function payload() {
	return {
		success: true,
		data: {
			server_id: 7,
			server_name: "edge",
			days: 1,
			max_days: 30,
			timezone: "UTC",
			tz_offset: 0,
			window_start: "2026-10-22T00:00:00Z",
			window_end: "2026-10-22T12:00:00Z",
			total_online_seconds: 3600,
			online_rate: 8.33,
			currently_online: true,
			last_active: "2026-10-22T12:00:00Z",
			periods: [
				{
					start: "2026-10-22T11:00:00Z",
					end: "2026-10-22T12:00:00Z",
					ongoing: true,
				},
			],
			daily: [{ date: "2026-10-22", online_seconds: 3600 }],
		},
	};
}
const respond = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

describe("official online history API contract", () => {
	beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
	it("defaults explicitly to one day and bypasses cached private windows", async () => {
		const body = payload();
		vi.mocked(fetch).mockResolvedValue(respond(body));
		await expect(fetchServerOnlineHistory(7)).resolves.toEqual(body);
		expect(fetch).toHaveBeenCalledWith(
			"/api/v1/server/7/online-history?days=1",
			{ cache: "no-store" },
		);
	});
	it("preserves the selected window and cancellation signal", async () => {
		const controller = new AbortController();
		vi.mocked(fetch).mockResolvedValue(respond(payload()));
		await fetchServerOnlineHistory(7, 7, controller.signal);
		expect(fetch).toHaveBeenCalledWith(
			"/api/v1/server/7/online-history?days=7",
			{ cache: "no-store", signal: controller.signal },
		);
	});
	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.MAX_SAFE_INTEGER + 1,
	])("rejects invalid server ID %s without a request", async (id) => {
		await expect(fetchServerOnlineHistory(id)).rejects.toThrow(
			"Invalid online history request",
		);
		expect(fetch).not.toHaveBeenCalled();
	});
	it.each([
		0,
		-1,
		1.5,
		3651,
		Number.NaN,
	])("rejects invalid window %s", async (days) => {
		await expect(fetchServerOnlineHistory(7, days)).rejects.toThrow(
			"Invalid online history request",
		);
		expect(fetch).not.toHaveBeenCalled();
	});
	it.each([200, 401])("recognizes unauthorized status %s", async (status) => {
		vi.mocked(fetch).mockResolvedValue(
			respond({ error: "ApiErrorUnauthorized" }, status),
		);
		const error = await fetchServerOnlineHistory(7).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NezhaApiError);
		expect(isUnauthorizedError(error)).toBe(true);
	});
	it("preserves the guest-window error for the one-day fallback", async () => {
		vi.mocked(fetch).mockResolvedValue(
			respond({ error: "unauthorized: only 1d data available for guests" }),
		);
		await expect(fetchServerOnlineHistory(7, 7)).rejects.toThrow(
			"only 1d data available for guests",
		);
	});
	it.each([
		{ server_id: 8 },
		{ max_days: 0 },
		{ days: 0 },
		{ server_name: null },
		{ window_start: "invalid" },
		{ window_end: "2026-10-21T00:00:00Z" },
		{ total_online_seconds: -1 },
		{ online_rate: 101 },
		{ currently_online: "true" },
		{ last_active: "invalid" },
		{ timezone: "invalid/timezone" },
		{ tz_offset: "0" },
		{ periods: null },
		{ periods: [{ start: "invalid", end: "invalid", ongoing: true }] },
		{
			periods: [
				{
					start: "2026-10-22T12:00:00Z",
					end: "2026-10-22T11:00:00Z",
					ongoing: true,
				},
			],
		},
		{ daily: null },
		{ daily: [{ date: "invalid", online_seconds: 0 }] },
		{ daily: [{ date: "2026-10-22", online_seconds: -1 }] },
	])("rejects malformed history: %j", async (change) => {
		const body = payload();
		Object.assign(body.data, change);
		vi.mocked(fetch).mockResolvedValue(respond(body));
		await expect(fetchServerOnlineHistory(7)).rejects.toThrow(
			"Invalid online history",
		);
	});
	it("supports empty history without inventing samples", async () => {
		const body = payload();
		Object.assign(body.data, {
			periods: [],
			daily: [],
			last_active: undefined,
			timezone: undefined,
			tz_offset: undefined,
			total_online_seconds: 0,
			online_rate: 0,
		});
		vi.mocked(fetch).mockResolvedValue(respond(body));
		await expect(fetchServerOnlineHistory(7)).resolves.toEqual(body);
	});
	it("distinguishes backend failures from authentication errors", () => {
		expect(isUnauthorizedError(new Error("network unavailable"))).toBe(false);
		expect(isUnauthorizedError("ApiErrorUnauthorized")).toBe(true);
	});
});
