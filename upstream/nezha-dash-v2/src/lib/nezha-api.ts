import { isRecord } from "@/lib/runtime-value";
import type {
	CycleTransferData,
	LoginUserResponse,
	MetricPeriod,
	MetricType,
	MonitorResponse,
	ServerGroupResponse,
	ServerMetricsResponse,
	ServiceData,
	ServiceResponse,
	SettingResponse,
} from "@/types/nezha-api";

let latestRefreshTokenAt = 0;
let refreshTokenRequest: Promise<void> | null = null;

export class NezhaApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "NezhaApiError";
		this.status = status;
	}
}

function hasValidOptionalType(
	record: Record<string, unknown>,
	key: string,
	type: "boolean" | "string",
) {
	return record[key] === undefined || typeof record[key] === type;
}

function parseSettingResponse(value: unknown): SettingResponse {
	if (!isRecord(value) || typeof value.success !== "boolean") {
		throw new Error("Invalid setting response");
	}
	if (!isRecord(value.data) || !isRecord(value.data.config)) {
		throw new Error("Invalid setting response");
	}

	const config = value.data.config;
	if (
		typeof config.language !== "string" ||
		typeof config.site_name !== "string" ||
		!hasValidOptionalType(config, "debug", "boolean") ||
		!hasValidOptionalType(config, "user_template", "string") ||
		!hasValidOptionalType(config, "admin_template", "string") ||
		!hasValidOptionalType(config, "custom_code", "string") ||
		!hasValidOptionalType(value.data, "version", "string") ||
		typeof value.data.tsdb_enabled !== "boolean"
	) {
		throw new Error("Invalid setting response");
	}

	return {
		success: value.success,
		data: {
			config: {
				language: config.language,
				site_name: config.site_name,
				...(typeof config.debug === "boolean" ? { debug: config.debug } : {}),
				...(typeof config.user_template === "string"
					? { user_template: config.user_template }
					: {}),
				...(typeof config.admin_template === "string"
					? { admin_template: config.admin_template }
					: {}),
				...(typeof config.custom_code === "string"
					? { custom_code: config.custom_code }
					: {}),
			},
			...(typeof value.data.version === "string"
				? { version: value.data.version }
				: {}),
			tsdb_enabled: value.data.tsdb_enabled,
		},
	};
}

function parseServerGroupResponse(value: unknown): ServerGroupResponse {
	if (
		!isRecord(value) ||
		typeof value.success !== "boolean" ||
		!Array.isArray(value.data)
	) {
		throw new Error("Invalid server group response");
	}

	const data = value.data.map((item) => {
		if (
			!isRecord(item) ||
			!isRecord(item.group) ||
			!Array.isArray(item.servers)
		) {
			throw new Error("Invalid server group response");
		}
		const group = item.group;
		if (
			(group.id !== undefined &&
				(!Number.isSafeInteger(group.id) || Number(group.id) <= 0)) ||
			!hasValidOptionalType(group, "created_at", "string") ||
			!hasValidOptionalType(group, "updated_at", "string") ||
			typeof group.name !== "string" ||
			!item.servers.every((id) => Number.isSafeInteger(id) && Number(id) > 0)
		) {
			throw new Error("Invalid server group response");
		}

		return {
			group: {
				name: group.name,
				...(group.id !== undefined ? { id: Number(group.id) } : {}),
				...(typeof group.created_at === "string"
					? { created_at: group.created_at }
					: {}),
				...(typeof group.updated_at === "string"
					? { updated_at: group.updated_at }
					: {}),
			},
			servers: item.servers.map(Number),
		};
	});

	return { success: value.success, data };
}

function finiteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
	return Number.isSafeInteger(value) && Number(value) > 0
		? Number(value)
		: null;
}

function numericSeries(value: unknown, optional = false): number[] | null {
	if ((value === undefined || value === null) && optional) return [];
	if (!Array.isArray(value)) return null;
	return value.every(
		(item): item is number => typeof item === "number" && Number.isFinite(item),
	)
		? value
		: null;
}

function stringMap(value: unknown): Record<string, string> | null {
	if (value === undefined || value === null) return {};
	if (!isRecord(value)) return null;
	const entries = Object.entries(value);
	return entries.every(
		(entry): entry is [string, string] => typeof entry[1] === "string",
	)
		? Object.fromEntries(entries)
		: null;
}

function numberMap(value: unknown): Record<string, number> | null {
	if (value === undefined || value === null) return {};
	if (!isRecord(value)) return null;
	const entries = Object.entries(value);
	return entries.every(
		(entry): entry is [string, number] =>
			typeof entry[1] === "number" && Number.isFinite(entry[1]),
	)
		? Object.fromEntries(entries)
		: null;
}

function parseServiceResponse(value: unknown): ServiceResponse {
	if (
		!isRecord(value) ||
		typeof value.success !== "boolean" ||
		!isRecord(value.data)
	) {
		throw new Error("Invalid service response");
	}

	const rawServices = isRecord(value.data.services) ? value.data.services : {};
	const services = Object.fromEntries(
		Object.entries(rawServices).flatMap(([id, item]) => {
			if (!isRecord(item)) return [];
			const currentUp = finiteNumber(item.current_up);
			const currentDown = finiteNumber(item.current_down);
			const totalUp = finiteNumber(item.total_up);
			const totalDown = finiteNumber(item.total_down);
			const delay = numericSeries(item.delay, true);
			const up = numericSeries(item.up, true);
			const down = numericSeries(item.down, true);
			if (
				currentUp === null ||
				currentDown === null ||
				totalUp === null ||
				totalDown === null ||
				delay === null ||
				up === null ||
				down === null
			) {
				return [];
			}
			const service: ServiceData = {
				service_name:
					typeof item.service_name === "string" ? item.service_name : id,
				current_up: currentUp,
				current_down: currentDown,
				total_up: totalUp,
				total_down: totalDown,
				delay,
				up,
				down,
			};
			return [[id, service]];
		}),
	);

	const rawCycles = isRecord(value.data.cycle_transfer_stats)
		? value.data.cycle_transfer_stats
		: {};
	const cycleTransferStats = Object.fromEntries(
		Object.entries(rawCycles).flatMap(([id, item]) => {
			if (!isRecord(item)) return [];
			const max = finiteNumber(item.max);
			const min = finiteNumber(item.min);
			const serverName = stringMap(item.server_name);
			const transfer = numberMap(item.transfer);
			const nextUpdate = stringMap(item.next_update);
			if (
				typeof item.name !== "string" ||
				typeof item.from !== "string" ||
				typeof item.to !== "string" ||
				max === null ||
				min === null ||
				serverName === null ||
				transfer === null ||
				nextUpdate === null
			) {
				return [];
			}
			const cycle: CycleTransferData = {
				name: item.name,
				from: item.from,
				to: item.to,
				max,
				min,
				server_name: serverName,
				transfer,
				next_update: nextUpdate,
			};
			return [[id, cycle]];
		}),
	);

	return {
		success: value.success,
		data: {
			services,
			cycle_transfer_stats: cycleTransferStats,
		},
	};
}

function parseLoginUserResponse(value: unknown): LoginUserResponse {
	const userId =
		isRecord(value) && isRecord(value.data)
			? positiveInteger(value.data.id)
			: null;
	if (
		!isRecord(value) ||
		typeof value.success !== "boolean" ||
		!isRecord(value.data) ||
		userId === null
	) {
		throw new Error("Invalid profile response");
	}

	return {
		success: value.success,
		data: {
			id: userId,
		},
	};
}

function parseMonitorResponse(value: unknown): MonitorResponse {
	if (
		!isRecord(value) ||
		typeof value.success !== "boolean" ||
		!Array.isArray(value.data)
	) {
		throw new Error("Invalid monitor response");
	}

	const data = value.data.flatMap((item) => {
		const monitorId = isRecord(item) ? positiveInteger(item.monitor_id) : null;
		const serverId = isRecord(item) ? positiveInteger(item.server_id) : null;
		if (
			!isRecord(item) ||
			monitorId === null ||
			serverId === null ||
			typeof item.monitor_name !== "string" ||
			typeof item.server_name !== "string"
		) {
			return [];
		}

		const createdAt = numericSeries(item.created_at);
		const avgDelay = numericSeries(item.avg_delay);
		const parsedPacketLoss =
			item.packet_loss === undefined
				? undefined
				: numericSeries(item.packet_loss);
		if (createdAt === null || avgDelay === null || parsedPacketLoss === null)
			return [];
		const packetLoss = parsedPacketLoss?.length ? parsedPacketLoss : undefined;
		const length = Math.min(
			createdAt.length,
			avgDelay.length,
			packetLoss?.length ?? Number.POSITIVE_INFINITY,
		);

		return [
			{
				monitor_id: monitorId,
				monitor_name: item.monitor_name,
				...(Number.isSafeInteger(item.display_index)
					? { display_index: Number(item.display_index) }
					: {}),
				server_id: serverId,
				server_name: item.server_name,
				created_at: createdAt.slice(0, length),
				avg_delay: avgDelay.slice(0, length),
				...(packetLoss ? { packet_loss: packetLoss.slice(0, length) } : {}),
			},
		];
	});

	return { success: value.success, data };
}

function parseServerMetricsResponse(value: unknown): ServerMetricsResponse {
	const serverId =
		isRecord(value) && isRecord(value.data)
			? positiveInteger(value.data.server_id)
			: null;
	if (
		!isRecord(value) ||
		typeof value.success !== "boolean" ||
		!isRecord(value.data) ||
		serverId === null ||
		typeof value.data.server_name !== "string" ||
		typeof value.data.metric !== "string" ||
		!Array.isArray(value.data.data_points)
	) {
		throw new Error("Invalid metrics response");
	}

	const dataPoints = value.data.data_points.flatMap((point) => {
		if (
			!isRecord(point) ||
			typeof point.ts !== "number" ||
			!Number.isFinite(point.ts) ||
			typeof point.value !== "number" ||
			!Number.isFinite(point.value)
		) {
			return [];
		}
		return [{ ts: point.ts, value: point.value }];
	});

	return {
		success: value.success,
		data: {
			server_id: serverId,
			server_name: value.data.server_name,
			metric: value.data.metric,
			data_points: dataPoints,
		},
	};
}

async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
	const response = init ? await fetch(input, init) : await fetch(input);
	let data: unknown;

	try {
		data = await response.json();
	} catch {
		throw new NezhaApiError(
			`Invalid JSON response (${response.status})`,
			response.status,
		);
	}

	const apiError =
		data && typeof data === "object" && "error" in data
			? Reflect.get(data, "error")
			: undefined;
	const errorMessage = typeof apiError === "string" ? apiError : "";
	if (!response.ok) {
		throw new NezhaApiError(
			errorMessage || `Request failed (${response.status})`,
			response.status,
		);
	}
	if (errorMessage) throw new NezhaApiError(errorMessage, response.status);

	return data;
}

function fetchJsonWithSignal(input: RequestInfo | URL, signal?: AbortSignal) {
	return signal ? fetchJson(input, { signal }) : fetchJson(input);
}

const getCookieValue = (name: string): string | undefined => {
	const cookie = document.cookie
		.split("; ")
		.find((item) => item.startsWith(`${name}=`));

	if (!cookie) {
		return undefined;
	}

	try {
		return decodeURIComponent(cookie.split("=").slice(1).join("="));
	} catch {
		return undefined;
	}
};

const getCsrfToken = (): string => {
	return getCookieValue("nz-csrf") || "";
};

export const fetchServerGroup = async (
	signal?: AbortSignal,
): Promise<ServerGroupResponse> => {
	// Public groups must keep the guest scope even when a dashboard session
	// exists in the same browser, and must never reuse a cached empty response.
	return parseServerGroupResponse(
		await fetchJson("/api/v1/server-group", {
			cache: "no-store",
			credentials: "omit",
			...(signal ? { signal } : {}),
		}),
	);
};

export const fetchLoginUser = async (
	signal?: AbortSignal,
): Promise<LoginUserResponse> => {
	const data = parseLoginUserResponse(
		await fetchJsonWithSignal("/api/v1/profile", signal),
	);

	// auto refresh token
	const csrfToken = getCsrfToken();
	if (
		data.success === true &&
		Number(data.data?.id) > 0 &&
		csrfToken &&
		(!latestRefreshTokenAt ||
			Date.now() - latestRefreshTokenAt > 1000 * 60 * 60) &&
		!refreshTokenRequest
	) {
		refreshTokenRequest = fetchJson("/api/v1/refresh-token", {
			method: "POST",
			headers: {
				"X-CSRF-Token": csrfToken,
			},
		})
			.then(() => {
				latestRefreshTokenAt = Date.now();
			})
			.finally(() => {
				refreshTokenRequest = null;
			});
		void refreshTokenRequest.catch(() => undefined);
	}

	return data;
};

export function isAuthenticatedProfile(
	profile: LoginUserResponse | undefined,
	error?: unknown,
): boolean {
	return (
		!(error instanceof NezhaApiError && error.status === 401) &&
		profile?.success === true &&
		profile.data.id > 0
	);
}

export type MonitorPeriod = MetricPeriod;

export const fetchMonitor = async (
	server_id: number,
	period?: MonitorPeriod,
	signal?: AbortSignal,
): Promise<MonitorResponse> => {
	const query = period ? `?period=${period}` : "";
	return parseMonitorResponse(
		await fetchJsonWithSignal(
			`/api/v1/server/${server_id}/service${query}`,
			signal,
		),
	);
};

export const fetchService = async (
	signal?: AbortSignal,
): Promise<ServiceResponse> => {
	return parseServiceResponse(
		await fetchJsonWithSignal("/api/v1/service", signal),
	);
};

export const fetchSetting = async (
	signal?: AbortSignal,
): Promise<SettingResponse> => {
	return parseSettingResponse(
		await fetchJsonWithSignal("/api/v1/setting", signal),
	);
};

export const fetchServerMetrics = async (
	server_id: number,
	metric: MetricType,
	period?: MetricPeriod,
	signal?: AbortSignal,
): Promise<ServerMetricsResponse> => {
	const query = period
		? `?metric=${metric}&period=${period}`
		: `?metric=${metric}`;
	const url = `/api/v1/server/${server_id}/metrics${query}`;
	return parseServerMetricsResponse(await fetchJsonWithSignal(url, signal));
};
