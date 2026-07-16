import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkChart, NetworkChartClient } from "@/components/NetworkChart";
import type { ChartConfig } from "@/components/ui/chart";
import { notifySakuraRuntimeConfigChanged } from "@/lib/sakura-config";
import { createTestQueryClient } from "@/test/utils";
import type { NezhaMonitor, ServerMonitorChart } from "@/types/nezha-api";

const apiMocks = vi.hoisted(() => ({
	fetchLoginUser: vi.fn(),
	fetchMonitor: vi.fn(),
}));

vi.mock("@/lib/nezha-api", () => ({
	fetchLoginUser: apiMocks.fetchLoginUser,
	fetchMonitor: apiMocks.fetchMonitor,
	isAuthenticatedProfile: (
		profile: { success: boolean; data: { id: number } } | undefined,
	) => profile?.success === true && profile.data.id > 0,
}));

vi.mock("recharts", () => {
	const createElement =
		(testId: string) =>
		({
			children,
			data,
			dataKey,
			tickFormatter,
			ticks,
		}: {
			children?: ReactNode;
			data?: unknown[];
			dataKey?: string;
			tickFormatter?: (value: number) => string;
			ticks?: number[];
		}) => (
			<div
				data-formatted-ticks={
					ticks && tickFormatter
						? JSON.stringify(ticks.map((tick) => tickFormatter(tick)))
						: undefined
				}
				data-key={dataKey}
				data-points={data?.length}
				data-testid={testId}
			>
				{children}
			</div>
		);

	const ComposedChart = createElement("composed-chart");
	const genericChart = createElement("generic-chart");

	return {
		Area: createElement("area"),
		AreaChart: genericChart,
		BarChart: genericChart,
		CartesianGrid: createElement("grid"),
		ComposedChart,
		FunnelChart: genericChart,
		Legend: ({ content }: { content?: ReactNode }) => (
			<div data-testid="chart-legend">{content}</div>
		),
		Line: createElement("line"),
		LineChart: genericChart,
		PieChart: genericChart,
		RadarChart: genericChart,
		RadialBarChart: genericChart,
		ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
			<div data-testid="responsive-chart">{children}</div>
		),
		Sankey: genericChart,
		ScatterChart: genericChart,
		Tooltip: ({ content }: { content?: ReactNode }) => (
			<div data-testid="chart-tooltip">{content}</div>
		),
		Treemap: genericChart,
		XAxis: createElement("x-axis"),
		YAxis: createElement("y-axis"),
	};
});

const times = Array.from(
	{ length: 12 },
	(_, index) => Date.parse("2025-01-01T00:00:00.000Z") + index * 60 * 60 * 1000,
);

const monitorData: NezhaMonitor[] = [
	{
		monitor_id: 2,
		monitor_name: "Beta",
		display_index: 1,
		server_id: 7,
		server_name: "edge-chart",
		created_at: times,
		avg_delay: [15, 18, 0, 45, 48, 52, 4000, 65, 70, 75, 80, 85],
	},
	{
		monitor_id: 1,
		monitor_name: "Alpha",
		display_index: 3,
		server_id: 7,
		server_name: "edge-chart",
		created_at: times,
		avg_delay: [30, 32, 35, 36, 38, 40, 42, 44, 46, 48, 50, 52],
		packet_loss: [0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
	},
];

const clientChartData: ServerMonitorChart = {
	Alpha: times.map((created_at, index) => ({
		created_at,
		avg_delay: 30 + index,
		packet_loss: index,
	})),
	Beta: times.map((created_at, index) => ({
		created_at,
		avg_delay: 60 + index,
		packet_loss: index % 2,
	})),
};

const clientFormattedData = times.map((created_at, index) => ({
	created_at,
	Alpha: 30 + index,
	Alpha_packet_loss: index,
	Beta: 60 + index,
	Beta_packet_loss: index % 2,
}));

const chartConfig = {
	avg_delay: { label: "monitor.avgDelay" },
	Alpha: { label: "Alpha" },
	Beta: { label: "Beta" },
} satisfies ChartConfig;

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

function renderWithQuery(ui: ReactElement) {
	return render(
		<QueryClientProvider client={createTestQueryClient()}>
			{ui}
		</QueryClientProvider>,
	);
}

describe("NetworkChart", () => {
	beforeEach(() => {
		apiMocks.fetchLoginUser.mockReset();
		apiMocks.fetchMonitor.mockReset();
		apiMocks.fetchLoginUser.mockRejectedValue(new Error("anonymous"));
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "",
		});
	});

	it("renders the loading state while monitor data is unavailable", () => {
		apiMocks.fetchMonitor.mockReturnValue(new Promise(() => undefined));

		const { container } = renderWithQuery(<NetworkChart server_id={7} />);

		expect(container.querySelector(".h-\\[250px\\]")).toBeInTheDocument();
	});

	it("renders the no-data state from the monitor API", async () => {
		apiMocks.fetchMonitor.mockResolvedValue({
			success: true,
			data: null,
		});

		renderWithQuery(<NetworkChart server_id={7} />);

		expect(await screen.findByText("monitor.noData")).toBeInTheDocument();
	});

	it("renders the empty state when the monitor request fails", async () => {
		apiMocks.fetchMonitor.mockRejectedValue(new Error("network unavailable"));

		const { container } = renderWithQuery(<NetworkChart server_id={7} />);

		expect(await screen.findByText("monitor.noData")).toBeInTheDocument();
		expect(container.querySelector(".h-\\[250px\\]")).not.toBeInTheDocument();
	});

	it("ignores monitor definitions that contain no chart points", async () => {
		apiMocks.fetchMonitor.mockResolvedValue({
			success: true,
			data: [
				{
					...monitorData[0],
					created_at: [],
					avg_delay: [],
				},
			],
		});

		renderWithQuery(<NetworkChart server_id={7} />);

		expect(await screen.findByText("monitor.noData")).toBeInTheDocument();
	});

	it("shows network and unmarked monitors while hiding service monitors", async () => {
		apiMocks.fetchMonitor.mockResolvedValue({
			success: true,
			data: [
				{ ...monitorData[0], monitor_name: "Edge Probe[network]" },
				{ ...monitorData[1], monitor_name: "Public Site[service]" },
				{ ...monitorData[1], monitor_id: 3, monitor_name: "Legacy Probe" },
			],
		});

		renderWithQuery(<NetworkChart server_id={7} />);

		expect(await screen.findByText("Edge Probe")).toBeInTheDocument();
		expect(screen.getByText("Legacy Probe")).toBeInTheDocument();
		expect(screen.getByText("2 monitor.monitorCount")).toBeInTheDocument();
		expect(screen.queryByText("Public Site")).not.toBeInTheDocument();
		expect(
			screen.queryByText(/\[(?:network|service)\]/i),
		).not.toBeInTheDocument();
	});

	it("does not reuse monitor data when switching to another server", async () => {
		apiMocks.fetchMonitor.mockImplementation((serverId: number) =>
			serverId === 7
				? Promise.resolve({ success: true, data: monitorData })
				: new Promise(() => undefined),
		);

		const queryClient = createTestQueryClient();
		const { rerender, container } = render(
			<QueryClientProvider client={queryClient}>
				<NetworkChart server_id={7} />
			</QueryClientProvider>,
		);
		expect(await screen.findByText("edge-chart")).toBeInTheDocument();

		rerender(
			<QueryClientProvider client={queryClient}>
				<NetworkChart server_id={8} />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(apiMocks.fetchMonitor).toHaveBeenCalledWith(
				8,
				"1d",
				expect.any(AbortSignal),
			);
		});
		expect(screen.queryByText("edge-chart")).not.toBeInTheDocument();
		expect(container.querySelector(".h-\\[250px\\]")).toBeInTheDocument();
	});

	it("does not invent packet loss when the API only returns delay", async () => {
		const user = userEvent.setup();
		apiMocks.fetchMonitor.mockResolvedValue({
			success: true,
			data: [monitorData[0]],
		});

		renderWithQuery(<NetworkChart server_id={7} />);
		await user.click(await screen.findByText("Beta"));

		expect(screen.queryByTestId("area")).not.toBeInTheDocument();
	});

	it("keeps monitors with the same display name as separate series", async () => {
		apiMocks.fetchMonitor.mockResolvedValue({
			success: true,
			data: [
				{ ...monitorData[0], monitor_id: 11, monitor_name: "Duplicate" },
				{ ...monitorData[1], monitor_id: 12, monitor_name: "Duplicate" },
			],
		});

		renderWithQuery(<NetworkChart server_id={7} />);

		expect(
			await screen.findByText("2 monitor.monitorCount"),
		).toBeInTheDocument();
		expect(screen.getAllByText("Duplicate")).toHaveLength(2);
		expect(screen.getAllByTestId("line")).toHaveLength(2);
	});

	it("fetches monitor data, transforms chart series, and allows logged-in period changes", async () => {
		const user = userEvent.setup();
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "session=1",
		});
		apiMocks.fetchLoginUser.mockResolvedValue(loginResponse());
		apiMocks.fetchMonitor.mockResolvedValue({
			success: true,
			data: monitorData,
		});

		renderWithQuery(<NetworkChart server_id={7} />);

		expect(await screen.findByText("edge-chart")).toBeInTheDocument();
		expect(apiMocks.fetchMonitor).toHaveBeenCalledWith(
			7,
			"1d",
			expect.any(AbortSignal),
		);
		expect(screen.getByText("2 monitor.monitorCount")).toBeInTheDocument();
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Beta")).toBeInTheDocument();
		expect(screen.getByTestId("composed-chart")).toHaveAttribute(
			"data-points",
			"12",
		);

		await user.click(screen.getByText("monitor.period7d"));

		await waitFor(() => {
			expect(apiMocks.fetchMonitor).toHaveBeenCalledWith(
				7,
				"7d",
				expect.any(AbortSignal),
			);
		});
	});

	it("does not unlock historical periods from an unsuccessful profile response", async () => {
		apiMocks.fetchLoginUser.mockResolvedValue({
			...loginResponse(),
			success: false,
		});
		apiMocks.fetchMonitor.mockResolvedValue({
			success: true,
			data: monitorData,
		});

		renderWithQuery(<NetworkChart server_id={7} />);

		expect(
			await screen.findByRole("button", { name: "monitor.period7d" }),
		).toBeDisabled();
	});
});

describe("NetworkChartClient", () => {
	it("uses the shared detail timeline interaction", () => {
		const { container } = render(
			<NetworkChartClient
				chartData={clientChartData}
				chartDataKey={["Alpha", "Beta"]}
				chartConfig={chartConfig}
				formattedData={clientFormattedData}
				isLogin={true}
				isPeriodLoading={false}
				onPeriodChange={vi.fn()}
				period="1d"
				serverName="edge-chart"
			/>,
		);

		expect(
			container.querySelector('[data-timeline-interaction="true"]'),
		).not.toBeNull();
	});

	it.each([
		["7d" as const, 7, false],
		["30d" as const, 30, false],
	])("formats the %s timeline with calendar dates", (period, days, includesTime) => {
		const start = Date.parse("2025-01-01T00:00:00.000Z");
		const formattedData = Array.from({ length: 31 }, (_, index) => ({
			created_at: start + (index * days * 24 * 60 * 60 * 1000) / 30,
			Alpha: 30 + index,
		}));

		render(
			<NetworkChartClient
				chartDataKey={["Alpha"]}
				chartConfig={chartConfig}
				chartData={{
					Alpha: formattedData.map(({ created_at, Alpha }) => ({
						created_at,
						avg_delay: Alpha,
					})),
				}}
				serverName="edge-client"
				formattedData={formattedData}
				isPeriodLoading={false}
				period={period}
				onPeriodChange={vi.fn()}
				isLogin={true}
			/>,
		);

		const labels = JSON.parse(
			screen.getByTestId("x-axis").getAttribute("data-formatted-ticks") ?? "[]",
		) as string[];
		expect(labels.length).toBeGreaterThan(1);
		expect(labels.every((label) => label.includes("/"))).toBe(true);
		expect(labels.every((label) => label.includes(":"))).toBe(includesTime);
	});

	it("uses an explicit Sakura network material class", () => {
		const onPeriodChange = vi.fn();

		const { container } = render(
			<NetworkChartClient
				chartDataKey={["Alpha", "Beta"]}
				chartConfig={chartConfig}
				chartData={clientChartData}
				serverName="edge-client"
				formattedData={clientFormattedData}
				isPeriodLoading={false}
				period="1d"
				onPeriodChange={onPeriodChange}
				isLogin={true}
			/>,
		);

		expect(
			container.querySelector(".sakura-detail-network-card"),
		).toBeInTheDocument();
	});

	it("locks longer periods for anonymous users and manages chart selection state", async () => {
		const user = userEvent.setup();
		const onPeriodChange = vi.fn();

		render(
			<NetworkChartClient
				chartDataKey={["Alpha", "Beta"]}
				chartConfig={chartConfig}
				chartData={clientChartData}
				serverName="edge-client"
				formattedData={clientFormattedData}
				isPeriodLoading={false}
				period="1d"
				onPeriodChange={onPeriodChange}
				isLogin={false}
			/>,
		);

		expect(screen.getByText("edge-client")).toBeInTheDocument();
		expect(screen.getByText("2 monitor.monitorCount")).toBeInTheDocument();

		await user.click(screen.getByText("monitor.period7d"));
		expect(onPeriodChange).not.toHaveBeenCalled();

		await user.click(screen.getByText("Alpha"));
		expect(
			screen.getByRole("button", { name: /monitor.clearSelections/ }),
		).toBeInTheDocument();
		expect(screen.getByTestId("area")).toHaveAttribute(
			"data-key",
			"packet_loss",
		);

		await user.click(screen.getByText("Beta"));
		expect(screen.queryByTestId("area")).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: /monitor.clearSelections/ }),
		);
		expect(
			screen.queryByRole("button", { name: /monitor.clearSelections/ }),
		).not.toBeInTheDocument();
	});

	it("shows period loading and honors forced peak-cut runtime config", async () => {
		const user = userEvent.setup();
		Object.assign(window, { ForcePeakCutEnabled: true });
		const onPeriodChange = vi.fn();

		const { container } = render(
			<NetworkChartClient
				chartDataKey={["Alpha", "Beta"]}
				chartConfig={chartConfig}
				chartData={clientChartData}
				serverName="edge-client"
				formattedData={clientFormattedData}
				isPeriodLoading={true}
				period="1d"
				onPeriodChange={onPeriodChange}
				isLogin={true}
			/>,
		);

		expect(container.querySelector(".opacity-60")).toBeInTheDocument();
		expect(
			screen.getByRole("switch", { name: "monitor.peakCut" }),
		).toHaveAttribute("data-state", "checked");

		await user.click(screen.getByText("monitor.period30d"));
		expect(onPeriodChange).toHaveBeenCalledWith("30d");

		await user.click(screen.getByRole("switch", { name: "monitor.peakCut" }));
		expect(
			screen.getByRole("switch", { name: "monitor.peakCut" }),
		).toHaveAttribute("data-state", "unchecked");
	});

	it("syncs forced peak-cut changes after the chart has mounted", async () => {
		Object.assign(window, { ForcePeakCutEnabled: false });
		const onPeriodChange = vi.fn();

		render(
			<NetworkChartClient
				chartDataKey={["Alpha", "Beta"]}
				chartConfig={chartConfig}
				chartData={clientChartData}
				serverName="edge-client"
				formattedData={clientFormattedData}
				isPeriodLoading={false}
				period="1d"
				onPeriodChange={onPeriodChange}
				isLogin={true}
			/>,
		);

		expect(
			screen.getByRole("switch", { name: "monitor.peakCut" }),
		).toHaveAttribute("data-state", "unchecked");

		Object.assign(window, { ForcePeakCutEnabled: true });
		notifySakuraRuntimeConfigChanged();

		await waitFor(() => {
			expect(
				screen.getByRole("switch", { name: "monitor.peakCut" }),
			).toHaveAttribute("data-state", "checked");
		});
	});

	it("removes selected monitors that disappear after a data refresh", async () => {
		const user = userEvent.setup();
		const onPeriodChange = vi.fn();
		const { rerender } = render(
			<NetworkChartClient
				chartDataKey={["Alpha", "Beta"]}
				chartConfig={chartConfig}
				chartData={clientChartData}
				serverName="edge-client"
				formattedData={clientFormattedData}
				isPeriodLoading={false}
				period="1d"
				onPeriodChange={onPeriodChange}
				isLogin={true}
			/>,
		);
		await user.click(screen.getByText("Alpha"));
		expect(
			screen.getByRole("button", { name: /monitor.clearSelections/ }),
		).toBeInTheDocument();

		rerender(
			<NetworkChartClient
				chartDataKey={["Beta"]}
				chartConfig={chartConfig}
				chartData={{ Beta: clientChartData.Beta }}
				serverName="edge-client"
				formattedData={clientFormattedData.map(({ created_at, Beta }) => ({
					created_at,
					Beta,
				}))}
				isPeriodLoading={false}
				period="1d"
				onPeriodChange={onPeriodChange}
				isLogin={true}
			/>,
		);

		await waitFor(() => {
			expect(
				screen.queryByRole("button", { name: /monitor.clearSelections/ }),
			).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("line")).toHaveAttribute("data-key", "Beta");
	});
});
