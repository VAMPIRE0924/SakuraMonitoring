import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { isRecord } from "@/lib/runtime-value";
import type { NezhaServer, NezhaWebsocketResponse } from "@/types/nezha-api";
import {
	WebSocketContext,
	type WebSocketContextType,
} from "./websocket-context";

interface WebSocketProviderProps {
	url: string;
	children: ReactNode;
}

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MANUAL_RECONNECT_DELAY_MS = 1000;

function reconnectDelay(attempt: number) {
	return Math.min(
		MAX_RECONNECT_DELAY_MS,
		INITIAL_RECONNECT_DELAY_MS * 2 ** Math.min(attempt, 5),
	);
}

function hasOwn(record: Record<string, unknown>, key: string) {
	// biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn is unavailable in the ES2020/Safari 15 target.
	return Object.prototype.hasOwnProperty.call(record, key);
}

function finiteNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonNegativeNumber(value: unknown) {
	return Math.max(0, finiteNumber(value));
}

function percentage(value: unknown) {
	return Math.min(100, nonNegativeNumber(value));
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
	if (typeof value === "string") return value ? [value] : [];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function numberArray(
	value: unknown,
	normalize: (item: unknown) => number = finiteNumber,
) {
	return Array.isArray(value) ? value.map(normalize) : [];
}

function normalizeServer(
	value: unknown,
	previous?: NezhaServer,
): NezhaServer | null {
	if (!isRecord(value) || !isRecord(value.host) || !isRecord(value.state)) {
		return null;
	}
	if (
		!Number.isSafeInteger(value.id) ||
		Number(value.id) <= 0 ||
		typeof value.name !== "string" ||
		typeof value.last_active !== "string"
	) {
		return null;
	}

	const host = value.host;
	const state = value.state;
	const temperatures = Array.isArray(state.temperatures)
		? state.temperatures.flatMap((item) => {
				if (!isRecord(item) || typeof item.Name !== "string") return [];
				return [
					{
						Name: item.Name,
						Temperature: finiteNumber(item.Temperature),
					},
				];
			})
		: [];

	return {
		id: Number(value.id),
		name: value.name,
		public_note: hasOwn(value, "public_note")
			? stringValue(value.public_note)
			: previous?.public_note || "",
		last_active: value.last_active,
		country_code: stringValue(value.country_code),
		host: {
			platform: stringValue(host.platform),
			platform_version: stringValue(host.platform_version),
			cpu: stringArray(host.cpu),
			gpu: stringArray(host.gpu),
			mem_total: nonNegativeNumber(host.mem_total),
			disk_total: nonNegativeNumber(host.disk_total),
			swap_total: nonNegativeNumber(host.swap_total),
			arch: stringValue(host.arch),
			boot_time: nonNegativeNumber(host.boot_time),
			version: stringValue(host.version),
		},
		state: {
			cpu: percentage(state.cpu),
			mem_used: nonNegativeNumber(state.mem_used),
			swap_used: nonNegativeNumber(state.swap_used),
			disk_used: nonNegativeNumber(state.disk_used),
			net_in_transfer: nonNegativeNumber(state.net_in_transfer),
			net_out_transfer: nonNegativeNumber(state.net_out_transfer),
			net_in_speed: nonNegativeNumber(state.net_in_speed),
			net_out_speed: nonNegativeNumber(state.net_out_speed),
			uptime: nonNegativeNumber(state.uptime),
			load_1: nonNegativeNumber(state.load_1),
			load_5: nonNegativeNumber(state.load_5),
			load_15: nonNegativeNumber(state.load_15),
			tcp_conn_count: nonNegativeNumber(state.tcp_conn_count),
			udp_conn_count: nonNegativeNumber(state.udp_conn_count),
			process_count: nonNegativeNumber(state.process_count),
			temperatures,
			gpu: numberArray(state.gpu, percentage),
		},
	};
}

function normalizeWebSocketResponse(
	value: unknown,
	previous?: NezhaWebsocketResponse | null,
): NezhaWebsocketResponse | null {
	if (!isRecord(value) || !Number.isFinite(value.now)) return null;
	const rawServers = Array.isArray(value.servers) ? value.servers : [];

	const previousServers = new Map(
		(previous?.servers || []).map((server) => [server.id, server]),
	);
	const servers = rawServers.map((server) =>
		normalizeServer(
			server,
			isRecord(server) && Number.isSafeInteger(server.id)
				? previousServers.get(Number(server.id))
				: undefined,
		),
	);
	if (servers.some((server) => server === null)) return null;
	const validServers = servers.filter(
		(server): server is NezhaServer => server !== null,
	);

	return {
		now: Number(value.now),
		online: Number.isFinite(value.online)
			? Math.max(0, Math.trunc(Number(value.online)))
			: undefined,
		servers: validServers,
	};
}

export function WebSocketProvider({ url, children }: WebSocketProviderProps) {
	const [lastData, setLastData] = useState<NezhaWebsocketResponse | null>(null);
	const [messageHistory, setMessageHistory] = useState<
		NezhaWebsocketResponse[]
	>([]);
	const [connected, setConnected] = useState(false);
	const [connectionState, setConnectionState] =
		useState<WebSocketContextType["connectionState"]>("connecting");
	const [needReconnect, setNeedReconnect] = useState(false);
	const ws = useRef<WebSocket | null>(null);
	const lastDataRef = useRef<NezhaWebsocketResponse | null>(null);
	const reconnectTimeout = useRef<number | null>(null);
	const reconnectAttempts = useRef(0);
	const isConnecting = useRef(false);

	const cleanup = useCallback(() => {
		if (ws.current) {
			ws.current.onopen = null;
			ws.current.onclose = null;
			ws.current.onmessage = null;
			ws.current.onerror = null;

			if (
				ws.current.readyState === WebSocket.OPEN ||
				ws.current.readyState === WebSocket.CONNECTING
			) {
				ws.current.close();
			}
			ws.current = null;
		}
		if (reconnectTimeout.current !== null) {
			window.clearTimeout(reconnectTimeout.current);
			reconnectTimeout.current = null;
		}
		isConnecting.current = false;
		setConnected(false);
	}, []);

	const connect = useCallback(() => {
		if (isConnecting.current) return;

		cleanup();
		isConnecting.current = true;
		setConnectionState("connecting");

		try {
			const wsUrl = new URL(url, window.location.origin);
			wsUrl.protocol = wsUrl.protocol.replace("http", "ws");
			ws.current = new WebSocket(wsUrl.toString());

			ws.current.onopen = () => {
				setConnected(true);
				setConnectionState("connected");
				reconnectAttempts.current = 0;
				isConnecting.current = false;
			};

			ws.current.onclose = () => {
				setConnected(false);
				setConnectionState("disconnected");
				ws.current = null;
				isConnecting.current = false;

				const delay = reconnectDelay(reconnectAttempts.current);
				reconnectTimeout.current = window.setTimeout(() => {
					reconnectTimeout.current = null;
					reconnectAttempts.current += 1;
					connect();
				}, delay);
			};

			ws.current.onmessage = (event) => {
				try {
					if (typeof event.data !== "string") return;
					const newData = normalizeWebSocketResponse(
						JSON.parse(event.data),
						lastDataRef.current,
					);
					if (!newData) return;

					lastDataRef.current = newData;
					setLastData(newData);
					setMessageHistory((previous) => [newData, ...previous].slice(0, 30));
				} catch {
					// Keep the last valid snapshot when a malformed frame arrives.
				}
			};

			ws.current.onerror = () => {
				isConnecting.current = false;
				ws.current?.close();
			};
		} catch {
			isConnecting.current = false;
			setConnectionState("disconnected");
			const delay = reconnectDelay(reconnectAttempts.current);
			reconnectTimeout.current = window.setTimeout(() => {
				reconnectTimeout.current = null;
				reconnectAttempts.current += 1;
				connect();
			}, delay);
		}
	}, [cleanup, url]);

	const reconnect = useCallback(() => {
		reconnectAttempts.current = 0;
		cleanup();
		setConnectionState("connecting");
		reconnectTimeout.current = window.setTimeout(
			connect,
			MANUAL_RECONNECT_DELAY_MS,
		);
	}, [cleanup, connect]);

	useEffect(() => {
		connect();

		const handleBeforeUnload = () => cleanup();
		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			cleanup();
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [cleanup, connect]);

	const contextValue: WebSocketContextType = useMemo(
		() => ({
			connected,
			connectionState,
			lastData,
			messageHistory,
			needReconnect,
			reconnect,
			setNeedReconnect,
		}),
		[
			connected,
			connectionState,
			lastData,
			messageHistory,
			needReconnect,
			reconnect,
		],
	);

	return (
		<WebSocketContext.Provider value={contextValue}>
			{children}
		</WebSocketContext.Provider>
	);
}
