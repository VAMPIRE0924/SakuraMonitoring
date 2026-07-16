import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandProvider } from "@/context/command-provider";
import { SortProvider } from "@/context/sort-provider";
import { StatusProvider } from "@/context/status-provider";
import { WebSocketProvider } from "@/context/websocket-provider";
import { useCommand } from "@/hooks/use-command";
import { useSort } from "@/hooks/use-sort";
import { useStatus } from "@/hooks/use-status";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import { notifySakuraRuntimeConfigChanged } from "@/lib/sakura-config";
import { createServer } from "@/test/fixtures";

class FakeWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	static instances: FakeWebSocket[] = [];

	readonly url: string;
	readyState = FakeWebSocket.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onmessage: ((event: MessageEvent<string>) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}

	open() {
		this.readyState = FakeWebSocket.OPEN;
		this.onopen?.(new Event("open"));
	}

	message(data: string) {
		this.onmessage?.(new MessageEvent("message", { data }));
	}

	error() {
		this.onerror?.(new Event("error"));
	}

	close() {
		this.readyState = FakeWebSocket.CLOSED;
		this.onclose?.(new CloseEvent("close"));
	}
}

function CommandProbe() {
	const { closeCommand, isOpen, openCommand, toggleCommand } = useCommand();

	return (
		<div>
			<p data-testid="command-state">{isOpen ? "open" : "closed"}</p>
			<button type="button" onClick={openCommand}>
				open
			</button>
			<button type="button" onClick={closeCommand}>
				close
			</button>
			<button type="button" onClick={toggleCommand}>
				toggle
			</button>
		</div>
	);
}

function SortProbe() {
	const { setSortOrder, setSortType, sortOrder, sortType } = useSort();

	return (
		<div>
			<p>{`${sortType}:${sortOrder}`}</p>
			<button type="button" onClick={() => setSortType("cpu")}>
				cpu
			</button>
			<button type="button" onClick={() => setSortOrder("asc")}>
				asc
			</button>
		</div>
	);
}

function StatusProbe() {
	const { setStatus, status } = useStatus();

	return (
		<div>
			<p data-testid="status-state">{status}</p>
			<button type="button" onClick={() => setStatus("online")}>
				online
			</button>
		</div>
	);
}

function WebSocketProbe() {
	const {
		connected,
		connectionState,
		lastData,
		messageHistory,
		needReconnect,
		reconnect,
		setNeedReconnect,
	} = useWebSocketContext();

	return (
		<div>
			<p data-testid="socket-connected">
				{connected ? "connected" : "disconnected"}
			</p>
			<p data-testid="connection-state">{connectionState}</p>
			<p>{lastData?.servers[0]?.name ?? "none"}</p>
			<p data-testid="message-count">{messageHistory.length}</p>
			<p data-testid="history-server-count">
				{messageHistory.reduce((total, item) => total + item.servers.length, 0)}
			</p>
			<p data-testid="normalized-server">
				{lastData?.servers[0]
					? `${lastData.servers[0].host.cpu[0] || "none"}:${lastData.servers[0].state.load_1}:${lastData.servers[0].state.cpu}:${lastData.servers[0].state.net_in_speed}:${lastData.servers[0].state.gpu.join(",")}:${lastData.servers[0].state.temperatures[0]?.Temperature}:${lastData.servers[0].state.temperatures.length}`
					: "none"}
			</p>
			<p data-testid="public-note">
				{lastData?.servers[0]?.public_note || "none"}
			</p>
			<p>{needReconnect ? "needs-reconnect" : "stable"}</p>
			<button type="button" onClick={() => setNeedReconnect(true)}>
				mark
			</button>
			<button type="button" onClick={reconnect}>
				reconnect
			</button>
		</div>
	);
}

describe("state providers", () => {
	it("manages command palette open state", async () => {
		const user = userEvent.setup();
		render(
			<CommandProvider>
				<CommandProbe />
			</CommandProvider>,
		);

		expect(screen.getByTestId("command-state")).toHaveTextContent("closed");
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		expect(screen.getByTestId("command-state")).toHaveTextContent("open");
		fireEvent.keyDown(document, { key: "k", metaKey: true });
		expect(screen.getByTestId("command-state")).toHaveTextContent("closed");
		await user.click(screen.getByRole("button", { name: "open" }));
		expect(screen.getByTestId("command-state")).toHaveTextContent("open");
		await user.click(screen.getByRole("button", { name: "toggle" }));
		expect(screen.getByTestId("command-state")).toHaveTextContent("closed");
		await user.click(screen.getByRole("button", { name: "open" }));
		await user.click(screen.getByRole("button", { name: "close" }));
		expect(screen.getByTestId("command-state")).toHaveTextContent("closed");
	});

	it("uses forced sort globals when valid and still allows local updates", async () => {
		window.ForceSortType = "mem";
		window.ForceSortOrder = "asc";
		const user = userEvent.setup();
		render(
			<SortProvider>
				<SortProbe />
			</SortProvider>,
		);

		expect(screen.getByText("mem:asc")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "cpu" }));
		expect(screen.getByText("cpu:asc")).toBeInTheDocument();
	});

	it("applies forced sort globals when public config is synced after mount", () => {
		render(
			<SortProvider>
				<SortProbe />
			</SortProvider>,
		);

		expect(screen.getByText("default:desc")).toBeInTheDocument();

		act(() => {
			window.ForceSortType = "rate";
			window.ForceSortOrder = "asc";
			notifySakuraRuntimeConfigChanged();
		});

		expect(screen.getByText("rate:asc")).toBeInTheDocument();

		act(() => {
			Reflect.deleteProperty(window, "ForceSortType");
			Reflect.deleteProperty(window, "ForceSortOrder");
			notifySakuraRuntimeConfigChanged();
		});

		expect(screen.getByText("default:desc")).toBeInTheDocument();
	});

	it("falls back to default sort values for invalid forced globals", () => {
		window.ForceSortType = "invalid";
		window.ForceSortOrder = "up";

		render(
			<SortProvider>
				<SortProbe />
			</SortProvider>,
		);

		expect(screen.getByText("default:desc")).toBeInTheDocument();
	});

	it("manages server status filters", async () => {
		const user = userEvent.setup();
		render(
			<StatusProvider>
				<StatusProbe />
			</StatusProvider>,
		);

		expect(screen.getByTestId("status-state")).toHaveTextContent("all");
		await user.click(screen.getByRole("button", { name: "online" }));
		expect(screen.getByTestId("status-state")).toHaveTextContent("online");
	});
});

describe("context hooks", () => {
	it("throws helpful errors when strict hooks miss their providers", () => {
		expect(() => renderHook(() => useCommand())).toThrow(
			"useCommand must be used within a CommandProvider",
		);
		expect(() => renderHook(() => useSort())).toThrow(
			"useSort must be used within a SortProvider",
		);
		expect(() => renderHook(() => useStatus())).toThrow(
			"useStatus must be used within a StatusProvider",
		);
	});
});

describe("WebSocketProvider", () => {
	beforeEach(() => {
		FakeWebSocket.instances = [];
		vi.stubGlobal("WebSocket", FakeWebSocket);
	});

	function renderWebSocketProvider(children: ReactNode) {
		return render(
			<WebSocketProvider url="/api/v1/ws/server">{children}</WebSocketProvider>,
		);
	}

	function websocketPayload(serverName: string) {
		return JSON.stringify({
			now: Date.parse("2025-01-01T00:00:20.000Z"),
			servers: [createServer({ name: serverName })],
		});
	}

	it("connects with a ws URL and records incoming messages", () => {
		renderWebSocketProvider(<WebSocketProbe />);

		const socket = FakeWebSocket.instances[0];
		expect(socket.url).toBe("wss://localhost/api/v1/ws/server");
		expect(screen.getByTestId("connection-state")).toHaveTextContent(
			"connecting",
		);

		act(() => {
			socket.open();
		});
		expect(screen.getByTestId("socket-connected")).toHaveTextContent(
			"connected",
		);
		expect(screen.getByTestId("connection-state")).toHaveTextContent(
			"connected",
		);

		act(() => {
			socket.message(websocketPayload("first"));
			socket.message(websocketPayload("second"));
		});

		expect(screen.getByText("second")).toBeInTheDocument();
		expect(screen.getByTestId("message-count")).toHaveTextContent("2");
	});

	it("normalizes missing and non-array server collections", () => {
		renderWebSocketProvider(<WebSocketProbe />);
		const socket = FakeWebSocket.instances[0];
		const now = Date.parse("2025-01-01T00:00:20.000Z");

		act(() => {
			socket.open();
			socket.message(JSON.stringify({ now }));
			socket.message(JSON.stringify({ now, servers: null }));
			socket.message(JSON.stringify({ now, servers: { invalid: true } }));
		});

		expect(screen.getByTestId("normalized-server")).toHaveTextContent("none");
		expect(screen.getByTestId("message-count")).toHaveTextContent("3");
		expect(screen.getByTestId("history-server-count")).toHaveTextContent("0");
	});

	it("keeps only the latest thirty websocket messages", () => {
		renderWebSocketProvider(<WebSocketProbe />);
		const socket = FakeWebSocket.instances[0];

		act(() => {
			socket.open();
			for (let index = 0; index < 31; index += 1) {
				socket.message(websocketPayload(`message-${index}`));
			}
		});

		expect(screen.getByText("message-30")).toBeInTheDocument();
		expect(screen.getByTestId("message-count")).toHaveTextContent("30");
	});

	it("ignores malformed websocket messages without disconnecting", () => {
		renderWebSocketProvider(<WebSocketProbe />);
		const socket = FakeWebSocket.instances[0];

		act(() => {
			socket.open();
			socket.message("not-json");
			socket.message(JSON.stringify({ now: 1, servers: [{}] }));
		});

		expect(screen.getByTestId("socket-connected")).toHaveTextContent(
			"connected",
		);
		expect(screen.getByTestId("normalized-server")).toHaveTextContent("none");
		expect(screen.getByTestId("public-note")).toHaveTextContent("none");
		expect(screen.getByTestId("message-count")).toHaveTextContent("0");
	});

	it("normalizes nested websocket fields before exposing server data", () => {
		renderWebSocketProvider(<WebSocketProbe />);
		const socket = FakeWebSocket.instances[0];
		const server = createServer({ name: "legacy-agent" });
		const payload = {
			now: Date.parse("2025-01-01T00:00:20.000Z"),
			servers: [
				{
					...server,
					host: { ...server.host, cpu: "Legacy CPU" },
					state: {
						...server.state,
						cpu: 140,
						gpu: [120, -5, "invalid"],
						load_1: -1,
						net_in_speed: -5,
						temperatures: [
							{ Name: "CPU", Temperature: -12.5 },
							{ Temperature: 80 },
						],
					},
				},
			],
		};

		act(() => {
			socket.open();
			socket.message(JSON.stringify(payload));
		});

		expect(screen.getByText("legacy-agent")).toBeInTheDocument();
		expect(screen.getByTestId("normalized-server")).toHaveTextContent(
			"Legacy CPU:0:100:0:100,0,0:-12.5:1",
		);
	});

	it("preserves omitted public notes but accepts an explicit clear", () => {
		renderWebSocketProvider(<WebSocketProbe />);
		const socket = FakeWebSocket.instances[0];
		const fullServer = createServer({ public_note: "live note" });
		const incrementalServer: Partial<typeof fullServer> = createServer();
		delete incrementalServer.public_note;

		act(() => {
			socket.open();
			socket.message(
				JSON.stringify({ now: Date.now(), servers: [fullServer] }),
			);
			socket.message(
				JSON.stringify({ now: Date.now(), servers: [incrementalServer] }),
			);
		});
		expect(screen.getByTestId("public-note")).toHaveTextContent("live note");

		act(() => {
			socket.message(
				JSON.stringify({
					now: Date.now(),
					servers: [createServer({ public_note: "" })],
				}),
			);
		});
		expect(screen.getByTestId("public-note")).toHaveTextContent("none");
	});

	it("cancels pending manual reconnect when unmounted", async () => {
		vi.useFakeTimers();
		const { unmount } = renderWebSocketProvider(<WebSocketProbe />);

		act(() => {
			screen.getByRole("button", { name: "reconnect" }).click();
		});
		expect(FakeWebSocket.instances).toHaveLength(1);

		unmount();
		await act(() => vi.advanceTimersByTimeAsync(1000));

		expect(FakeWebSocket.instances).toHaveLength(1);
	});

	it("keeps retrying after the previous thirty-attempt cutoff", async () => {
		vi.useFakeTimers();
		renderWebSocketProvider(<WebSocketProbe />);

		for (let attempt = 0; attempt < 31; attempt += 1) {
			act(() =>
				FakeWebSocket.instances[FakeWebSocket.instances.length - 1]?.close(),
			);
			await act(() => vi.runOnlyPendingTimersAsync());
		}

		expect(FakeWebSocket.instances).toHaveLength(32);
	});

	it("routes socket errors through the reconnect backoff", async () => {
		vi.useFakeTimers();
		renderWebSocketProvider(<WebSocketProbe />);

		act(() => FakeWebSocket.instances[0].error());
		expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);

		await act(() => vi.runOnlyPendingTimersAsync());
		expect(FakeWebSocket.instances).toHaveLength(2);
	});

	it("retries when constructing the socket throws", async () => {
		vi.useFakeTimers();
		let attempts = 0;
		class ThrowOnceWebSocket extends FakeWebSocket {
			constructor(url: string) {
				attempts += 1;
				if (attempts === 1) throw new Error("constructor failed");
				super(url);
			}
		}
		vi.stubGlobal("WebSocket", ThrowOnceWebSocket);

		renderWebSocketProvider(<WebSocketProbe />);
		expect(attempts).toBe(1);
		expect(FakeWebSocket.instances).toHaveLength(0);
		expect(screen.getByTestId("connection-state")).toHaveTextContent(
			"disconnected",
		);

		await act(() => vi.runOnlyPendingTimersAsync());
		expect(attempts).toBe(2);
		expect(FakeWebSocket.instances).toHaveLength(1);
	});

	it("exposes manual reconnect state separately from socket state", async () => {
		const user = userEvent.setup();
		renderWebSocketProvider(<WebSocketProbe />);

		expect(screen.getByText("stable")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "mark" }));
		expect(screen.getByText("needs-reconnect")).toBeInTheDocument();
	});
});
