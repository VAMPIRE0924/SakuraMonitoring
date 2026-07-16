import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerDetailChart from "@/components/ServerDetailChart";
import { createServer, createSettingResponse } from "@/test/fixtures";
import { createTestQueryClient } from "@/test/utils";
import type { NezhaServer, NezhaWebsocketResponse } from "@/types/nezha-api";

const detailChartMocks = vi.hoisted(() => ({
	connected: true,
	fetchLoginUser: vi.fn(),
	fetchServerMetrics: vi.fn(),
	fetchSetting: vi.fn(),
	lastData: null as NezhaWebsocketResponse | null,
	messageHistory: [] as NezhaWebsocketResponse[],
}));

vi.mock("recharts", () => {
	const createElement =
		(testId: string) =>
		({
			children,
			data,
			dataKey,
			domain,
		}: {
			children?: ReactNode;
			data?: unknown[];
			dataKey?: string;
			domain?: unknown[];
		}) => (
			<div
				data-domain={domain ? JSON.stringify(domain) : undefined}
				data-key={dataKey}
				data-points={data?.length}
				data-values={data ? JSON.stringify(data) : undefined}
				data-testid={testId}
			>
				{children}
			</div>
		);

	const AreaChart = createElement("area-chart");
	const LineChart = createElement("line-chart");
	const genericChart = createElement("generic-chart");

	return {
		Area: createElement("area"),
		AreaChart,
		BarChart: genericChart,
		CartesianGrid: createElement("grid"),
		ComposedChart: genericChart,
		FunnelChart: genericChart,
		Legend: ({ content }: { content?: ReactNode }) => (
			<div data-testid="chart-legend">{content}</div>
		),
		Line: createElement("line"),
		LineChart,
		PieChart: genericChart,
		RadarChart: genericChart,
		RadialBarChart: genericChart,
		ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
			<div data-testid="responsive-chart">{children}</div>
		),
		Sankey: genericChart,
		ScatterChart: genericChart,
		Tooltip: ({ content }: { content?: ReactNode }) => (
			<div data-testid="chart-tooltip">
				{isValidElement(content)
					? cloneElement(content, {
							active: true,
							payload: [
								{
									color: "#2563eb",
									dataKey: "cpu",
									name: "cpu",
									payload: { timeStamp: "1735689600000" },
									value: 42,
								},
							],
						} as never)
					: content}
			</div>
		),
		Treemap: genericChart,
		XAxis: createElement("x-axis"),
		YAxis: createElement("y-axis"),
	};
});

vi.mock("@/hooks/use-websocket-context", () => ({
	useWebSocketContext: () => ({
		connected: detailChartMocks.connected,
		lastData: detailChartMocks.lastData,
		messageHistory: detailChartMocks.messageHistory,
	}),
}));

vi.mock("@/lib/nezha-api", () => ({
	fetchLoginUser: detailChartMocks.fetchLoginUser,
	fetchServerMetrics: detailChartMocks.fetchServerMetrics,
	fetchSetting: detailChartMocks.fetchSetting,
	isAuthenticatedProfile: (
		profile: { success: boolean; data: { id: number } } | undefined,
	) => profile?.success === true && profile.data.id > 0,
}));

function settingResponse(tsdbEnabled = true) {
	return {
		...createSettingResponse(),
		data: {
			...createSettingResponse().data,
			tsdb_enabled: tsdbEnabled,
		},
	};
}

function loginResponse() {
	return {
		success: true,
		data: {
			id: 1,
			username: "admin",
			password: "",
			created_at: "2025-01-01T00:00:00.000Z",
			updated_at: "2025-01-01T00:00:00.000Z",
		},
	};
}

function metricsResponse(metric: string) {
	return {
		success: true,
		data: {
			server_id: 7,
			server_name: "edge-chart-detail",
			metric,
			data_points: [
				{ ts: Date.parse("2025-01-01T00:00:00.000Z"), value: 10 },
				{ ts: Date.parse("2025-01-01T01:00:00.000Z"), value: 20 },
				{ ts: Date.parse("2025-01-01T02:00:00.000Z"), value: 30 },
			],
		},
	};
}

function websocketPayload(server: NezhaServer, now: number) {
	return {
		now,
		servers: [server],
	};
}

function renderWithQuery(ui: React.ReactElement) {
	return render(
		<QueryClientProvider client={createTestQueryClient()}>
			{ui}
		</QueryClientProvider>,
	);
}

function seedWebSocketData() {
	const baseNow = Date.parse("2025-01-01T00:00:20.000Z");
	const server = createServer({
		id: 7,
		name: "edge-chart-detail",
		host: {
			gpu: ["NVIDIA T4"],
		},
		state: {
			cpu: 45,
			disk_used: 180,
			gpu: [33],
			mem_used: 80,
			net_in_speed: 4 * 1024 ** 2,
			net_out_speed: 3 * 1024 ** 2,
			process_count: 77,
			swap_used: 25,
			tcp_conn_count: 18,
			udp_conn_count: 9,
		},
	});

	detailChartMocks.connected = true;
	detailChartMocks.lastData = websocketPayload(server, baseNow);
	detailChartMocks.messageHistory = [0, 1, 2].map((index) =>
		websocketPayload(
			createServer({
				id: 7,
				host: {
					gpu: ["NVIDIA T4"],
				},
				state: {
					cpu: 30 + index,
					disk_used: 100 + index * 10,
					gpu: [20 + index],
					mem_used: 50 + index * 5,
					net_in_speed: (1 + index) * 1024 ** 2,
					net_out_speed: (2 + index) * 1024 ** 2,
					process_count: 60 + index,
					swap_used: 10 + index,
					tcp_conn_count: 10 + index,
					udp_conn_count: 5 + index,
				},
			}),
			baseNow - index * 1000,
		),
	);
}

describe("ServerDetailChart", () => {
	beforeEach(() => {
		detailChartMocks.connected = true;
		detailChartMocks.fetchLoginUser.mockReset();
		detailChartMocks.fetchServerMetrics.mockReset();
		detailChartMocks.fetchSetting.mockReset();
		detailChartMocks.lastData = null;
		detailChartMocks.messageHistory = [];
		detailChartMocks.fetchLoginUser.mockRejectedValue(new Error("anonymous"));
		detailChartMocks.fetchSetting.mockResolvedValue(settingResponse());
	});

	it("renders the loading grid without websocket data", () => {
		detailChartMocks.connected = false;

		const { container } = renderWithQuery(<ServerDetailChart server_id="7" />);

		expect(container.querySelectorAll(".h-\\[182px\\]")).toHaveLength(6);
	});

	it("renders realtime resource, network, connection, and GPU charts", async () => {
		const user = userEvent.setup();
		seedWebSocketData();

		renderWithQuery(<ServerDetailChart server_id="7" />);

		expect(
			await screen.findByText("serverDetailChart.realtime"),
		).toBeInTheDocument();
		expect(screen.getByText("serverDetailChart.period1d")).toBeInTheDocument();
		expect(screen.getByText("serverDetailChart.period7d")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "serverDetailChart.period7d" }),
		).toBeDisabled();
		for (const label of [
			"CPU",
			"GPU: NVIDIA T4",
			"serverDetailChart.mem",
			"serverDetailChart.swap",
			"serverDetailChart.disk",
			"serverDetailChart.process",
			"serverDetailChart.upload",
			"serverDetailChart.download",
			"TCP",
			"UDP",
		]) {
			expect(screen.getAllByText(label).length).toBeGreaterThan(0);
		}
		expect(screen.getAllByTestId("area-chart").length).toBeGreaterThan(0);
		expect(screen.getAllByTestId("line-chart").length).toBeGreaterThan(0);
		expect(screen.getAllByText("42.0%").length).toBeGreaterThan(0);

		await user.click(screen.getByText("serverDetailChart.period7d"));

		expect(detailChartMocks.fetchServerMetrics).not.toHaveBeenCalled();
	});

	it("keeps websocket history loaded on the initial realtime render", async () => {
		seedWebSocketData();

		renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("serverDetailChart.realtime");
		await waitFor(() => {
			for (const chart of [
				...screen.getAllByTestId("area-chart"),
				...screen.getAllByTestId("line-chart"),
			]) {
				expect(Number(chart.getAttribute("data-points"))).toBeGreaterThan(0);
			}
		});
	});

	it("routes every resource chart through the shared timeline layer", async () => {
		seedWebSocketData();

		renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("serverDetailChart.realtime");
		const charts = [
			...screen.getAllByTestId("area-chart"),
			...screen.getAllByTestId("line-chart"),
		];
		const timelineContainers = document.querySelectorAll(
			'[data-timeline-interaction="true"]',
		);
		expect(timelineContainers).toHaveLength(charts.length);
		expect(screen.getAllByTestId("responsive-chart")).toHaveLength(
			charts.length,
		);
	});

	it("renders the current realtime point before websocket history is populated", async () => {
		seedWebSocketData();
		detailChartMocks.messageHistory = [];

		renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("serverDetailChart.realtime");
		for (const chart of [
			...screen.getAllByTestId("area-chart"),
			...screen.getAllByTestId("line-chart"),
		]) {
			expect(chart).toHaveAttribute("data-points", "2");
		}
	});

	it("uses the same resource chart timeline layer on touch devices", async () => {
		vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
			matches: query.includes("pointer: coarse"),
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));
		seedWebSocketData();

		renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("serverDetailChart.realtime");
		const charts = [
			...screen.getAllByTestId("area-chart"),
			...screen.getAllByTestId("line-chart"),
		];
		expect(
			document.querySelectorAll('[data-timeline-interaction="true"]'),
		).toHaveLength(charts.length);
		expect(charts.length).toBeGreaterThan(0);
	});

	it("scales the network axis from zero across both upload and download", async () => {
		seedWebSocketData();
		if (detailChartMocks.lastData) {
			detailChartMocks.lastData.servers[0].state.net_out_speed = 9 * 1024 ** 2;
			detailChartMocks.lastData.servers[0].state.net_in_speed = 2 * 1024 ** 2;
		}

		renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("serverDetailChart.realtime");
		const networkChart = screen
			.getAllByTestId("line-chart")
			.find((chart) => chart.getAttribute("data-values")?.includes("upload"));
		expect(
			networkChart?.querySelector('[data-testid="y-axis"]'),
		).toHaveAttribute("data-domain", "[0,9]");
	});

	it("records zero GPU samples using the websocket clock", async () => {
		seedWebSocketData();
		const nextNow = (detailChartMocks.lastData?.now ?? 0) + 1000;
		const { rerender } = renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("GPU: NVIDIA T4");
		detailChartMocks.lastData = websocketPayload(
			createServer({
				id: 7,
				host: { gpu: ["NVIDIA T4"] },
				state: { gpu: [0] },
			}),
			nextNow,
		);
		rerender(
			<QueryClientProvider client={createTestQueryClient()}>
				<ServerDetailChart server_id="7" />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			const chart = screen
				.getAllByTestId("area-chart")
				.map((element) =>
					JSON.parse(element.getAttribute("data-values") || "[]"),
				)
				.find((data) => data.some((point: object) => "gpu" in point));
			const lastPoint = chart ? chart[chart.length - 1] : undefined;
			expect(lastPoint).toEqual({
				timeStamp: nextNow.toString(),
				gpu: 0,
			});
		});
	});

	it("keeps known GPU names when the host and state arrays have different lengths", async () => {
		seedWebSocketData();
		if (detailChartMocks.lastData) {
			detailChartMocks.lastData.servers[0].host.gpu = ["NVIDIA T4"];
			detailChartMocks.lastData.servers[0].state.gpu = [20, 30];
		}

		renderWithQuery(<ServerDetailChart server_id="7" />);

		expect(await screen.findByText("GPU: NVIDIA T4")).toBeInTheDocument();
		expect(screen.getByText("GPU: #2")).toBeInTheDocument();
	});

	it("shows one maximum-GPU chart for historical data", async () => {
		const user = userEvent.setup();
		seedWebSocketData();
		if (detailChartMocks.lastData) {
			detailChartMocks.lastData.servers[0].host.gpu = [
				"NVIDIA T4",
				"RTX A4000",
			];
			detailChartMocks.lastData.servers[0].state.gpu = [20, 30];
		}
		detailChartMocks.fetchServerMetrics.mockImplementation(
			(_serverId: number, metric: string) =>
				Promise.resolve(metricsResponse(metric)),
		);

		const { container } = renderWithQuery(<ServerDetailChart server_id="7" />);
		await screen.findByText("GPU: NVIDIA T4");
		expect(screen.getByText("GPU: RTX A4000")).toBeInTheDocument();

		const historyButton = screen.getByRole("button", {
			name: "serverDetailChart.period1d",
		});
		await user.click(historyButton);

		await waitFor(() => {
			const gpuCards = Array.from(
				container.querySelectorAll(".sakura-detail-chart-card"),
			).filter((card) => card.textContent?.includes("GPU"));
			expect(gpuCards).toHaveLength(1);
		});
		expect(screen.queryByText("GPU: NVIDIA T4")).not.toBeInTheDocument();
		expect(screen.queryByText("GPU: RTX A4000")).not.toBeInTheDocument();
	});

	it("keeps the historical GPU chart when only host metadata is available", async () => {
		const user = userEvent.setup();
		seedWebSocketData();
		if (detailChartMocks.lastData) {
			detailChartMocks.lastData.servers[0].host.gpu = ["NVIDIA T4"];
			detailChartMocks.lastData.servers[0].state.gpu = [];
		}
		detailChartMocks.fetchServerMetrics.mockImplementation(
			(_serverId: number, metric: string) =>
				Promise.resolve(metricsResponse(metric)),
		);

		const { container } = renderWithQuery(<ServerDetailChart server_id="7" />);
		await user.click(
			await screen.findByRole("button", {
				name: "serverDetailChart.period1d",
			}),
		);

		await waitFor(() => {
			const gpuCards = Array.from(
				container.querySelectorAll(".sakura-detail-chart-card"),
			).filter((card) => card.textContent?.includes("GPU"));
			expect(gpuCards).toHaveLength(1);
		});
	});

	it("outer-joins paired historical metrics without fabricating zeroes", async () => {
		const user = userEvent.setup();
		seedWebSocketData();
		const firstTimestamp = Date.parse("2025-01-01T00:00:00.000Z");
		const secondTimestamp = Date.parse("2025-01-01T01:00:00.000Z");
		detailChartMocks.fetchServerMetrics.mockImplementation(
			(_serverId: number, metric: string) =>
				Promise.resolve({
					...metricsResponse(metric),
					data: {
						...metricsResponse(metric).data,
						data_points:
							metric === "memory"
								? [{ ts: firstTimestamp, value: 128 }]
								: metric === "swap"
									? [{ ts: secondTimestamp, value: 64 }]
									: metricsResponse(metric).data.data_points,
					},
				}),
		);

		renderWithQuery(<ServerDetailChart server_id="7" />);
		await user.click(
			await screen.findByRole("button", {
				name: "serverDetailChart.period1d",
			}),
		);

		await waitFor(() => {
			const memoryChart = screen
				.getAllByTestId("area-chart")
				.find((chart) => chart.getAttribute("data-values")?.includes('"mem"'));
			expect(memoryChart).toHaveAttribute("data-points", "2");
			const values = JSON.parse(
				memoryChart?.getAttribute("data-values") ?? "[]",
			);
			expect(values).toEqual([
				expect.objectContaining({ mem: expect.any(Number), swap: null }),
				expect.objectContaining({ mem: null, swap: expect.any(Number) }),
			]);
		});
	});

	it("replaces realtime history when the mounted detail switches servers", async () => {
		seedWebSocketData();
		const queryClient = createTestQueryClient();
		const { rerender } = render(
			<QueryClientProvider client={queryClient}>
				<ServerDetailChart server_id="7" />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			const cpuChart = screen
				.getAllByTestId("area-chart")
				.find((chart) => chart.getAttribute("data-values")?.includes('"cpu"'));
			expect(cpuChart?.getAttribute("data-values")).toContain('"cpu":31');
		});

		const nextNow = Date.parse("2025-01-01T00:01:00.000Z");
		detailChartMocks.lastData = websocketPayload(
			createServer({ id: 8, state: { cpu: 88 }, host: { gpu: [] } }),
			nextNow,
		);
		detailChartMocks.messageHistory = [80, 81].map((cpu, index) =>
			websocketPayload(
				createServer({ id: 8, state: { cpu }, host: { gpu: [] } }),
				nextNow - index * 1000,
			),
		);
		rerender(
			<QueryClientProvider client={queryClient}>
				<ServerDetailChart server_id="8" />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			const cpuChart = screen
				.getAllByTestId("area-chart")
				.find((chart) => chart.getAttribute("data-values")?.includes('"cpu"'));
			const values = JSON.parse(
				cpuChart?.getAttribute("data-values") ?? "[]",
			) as {
				cpu: number;
			}[];
			expect(values.length).toBeGreaterThan(0);
			expect(values.every((point) => point.cpu >= 80)).toBe(true);
		});
	});

	it("uses explicit Sakura chart material classes", async () => {
		seedWebSocketData();

		const { container } = renderWithQuery(<ServerDetailChart server_id="7" />);

		expect(
			await screen.findByText("serverDetailChart.realtime"),
		).toBeInTheDocument();
		expect(
			container.querySelectorAll(".sakura-detail-chart-card").length,
		).toBeGreaterThan(0);
	});

	it("prevents historical periods when TSDB is disabled", async () => {
		const user = userEvent.setup();
		seedWebSocketData();
		detailChartMocks.fetchSetting.mockResolvedValue(settingResponse(false));

		renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("serverDetailChart.realtime");
		await user.click(screen.getByText("serverDetailChart.period1d"));

		expect(detailChartMocks.fetchServerMetrics).not.toHaveBeenCalled();
	});

	it("does not trust a profile id from an unsuccessful response", async () => {
		seedWebSocketData();
		detailChartMocks.fetchLoginUser.mockResolvedValue({
			...loginResponse(),
			success: false,
		});

		renderWithQuery(<ServerDetailChart server_id="7" />);

		expect(
			await screen.findByRole("button", {
				name: "serverDetailChart.period7d",
			}),
		).toBeDisabled();
	});

	it("fetches every historical metric group for the selected period", async () => {
		const user = userEvent.setup();
		seedWebSocketData();
		detailChartMocks.fetchLoginUser.mockResolvedValue(loginResponse());
		detailChartMocks.fetchServerMetrics.mockImplementation(
			(
				_serverId: number,
				_metric: string,
				_period: string,
				signal: AbortSignal,
			) =>
				new Promise((_, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(new DOMException("Aborted", "AbortError")),
						{ once: true },
					);
				}),
		);

		const { unmount } = renderWithQuery(<ServerDetailChart server_id="7" />);

		await screen.findByText("serverDetailChart.realtime");
		await waitFor(() => {
			expect(
				screen.getByText("serverDetailChart.period7d").parentElement,
			).not.toHaveClass("cursor-not-allowed");
		});
		expect(
			screen.getByRole("button", { name: "serverDetailChart.period7d" }),
		).toBeEnabled();
		await user.click(screen.getByText("serverDetailChart.period7d"));

		for (const metric of [
			"cpu",
			"gpu",
			"memory",
			"swap",
			"disk",
			"process_count",
			"net_out_speed",
			"net_in_speed",
			"tcp_conn",
			"udp_conn",
		]) {
			await waitFor(() => {
				expect(detailChartMocks.fetchServerMetrics).toHaveBeenCalledWith(
					7,
					metric,
					"7d",
					expect.any(AbortSignal),
				);
			});
		}

		const requestSignals = detailChartMocks.fetchServerMetrics.mock.calls.map(
			(call) => call[3] as AbortSignal,
		);
		expect(requestSignals).toHaveLength(10);
		expect(requestSignals.every((signal) => !signal.aborted)).toBe(true);

		unmount();
		expect(requestSignals.every((signal) => signal.aborted)).toBe(true);
	});
});
