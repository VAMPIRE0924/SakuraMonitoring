import { useQuery } from "@tanstack/react-query";
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	Area,
	AreaChart,
	CartesianGrid,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import {
	ServerTimelineChart,
	ServerTimelineProvider,
	ServerTimelineTooltip,
} from "@/components/ServerTimelineChart";
import { Card, CardContent } from "@/components/ui/card";
import { type ChartConfig, ChartTooltipContent } from "@/components/ui/chart";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveIndicator } from "@/hooks/use-active-indicator";
import { useLoginProfile } from "@/hooks/use-login-profile";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import { fetchServerMetrics, fetchSetting } from "@/lib/nezha-api";
import { formatSakuraBytes } from "@/lib/sakura-format";
import {
	cn,
	formatNezhaInfo,
	formatRelativeTime,
	formatTime,
} from "@/lib/utils";
import type {
	MetricPeriod,
	MetricType,
	NezhaServer,
	NezhaWebsocketResponse,
} from "@/types/nezha-api";

import ChartSkeleton from "./loading/ChartSkeleton";
import { ServerDetailChartLoading } from "./loading/ServerDetailLoading";
import AnimatedCircularProgressBar from "./ui/animated-circular-progress-bar";

type ChartPeriod = "realtime" | MetricPeriod;

type GpuChartData = {
	timeStamp: string;
	gpu: number;
};

type CpuChartData = {
	timeStamp: string;
	cpu: number;
};

type ProcessChartData = {
	timeStamp: string;
	process: number;
};

type DiskChartData = {
	timeStamp: string;
	disk: number;
};

const REALTIME_HISTORY_LIMIT = 30;
function appendRealtimePoint<T extends { timeStamp: string }>(
	history: T[],
	point: T,
): T[] {
	if (history.length === 0) return [point, point];
	const next =
		history[history.length - 1]?.timeStamp === point.timeStamp
			? [...history.slice(0, -1), point]
			: [...history, point];
	return next.slice(-REALTIME_HISTORY_LIMIT);
}

function DetailChartCard({
	header,
	config,
	isLoading,
	timelineValues,
	children,
}: {
	header: ReactNode;
	config: ChartConfig;
	isLoading: boolean;
	timelineValues: ReadonlyArray<string | number>;
	children: ReactNode;
}) {
	return (
		<Card className="sakura-detail-chart-card">
			<CardContent className="px-6 py-3">
				<section className="flex flex-col gap-1">
					{header}
					<ServerTimelineChart
						config={config}
						timelineValues={timelineValues}
						className="aspect-auto h-[130px] w-full"
					>
						{isLoading ? <ChartSkeleton /> : children}
					</ServerTimelineChart>
				</section>
			</CardContent>
		</Card>
	);
}

const DETAIL_CHART_MARGIN = { top: 12, left: 12, right: 12 };
const DETAIL_TIME_AXIS_PROPS = {
	dataKey: "timeStamp",
	tickLine: false,
	axisLine: false,
	tickMargin: 8,
	minTickGap: 200,
	interval: "preserveStartEnd" as const,
	tickFormatter: (value: string | number) => formatRelativeTime(Number(value)),
};
const DETAIL_PERCENT_AXIS_PROPS = {
	tickLine: false,
	axisLine: false,
	mirror: true,
	tickMargin: -15,
	domain: [0, 100] as [number, number],
	tickFormatter: (value: number) => `${value}%`,
};

function PercentChartTooltip({
	metricLabel,
	...tooltipProps
}: {
	metricLabel: string;
} & ComponentProps<typeof ChartTooltipContent>) {
	return (
		<ChartTooltipContent
			{...tooltipProps}
			indicator="dot"
			labelFormatter={(_, payload) =>
				formatTime(Number(payload[0]?.payload?.timeStamp))
			}
			formatter={(value) => (
				<div className="flex flex-1 items-center justify-between leading-none">
					<span className="text-muted-foreground">{metricLabel}</span>
					<span className="ml-2 font-medium text-foreground tabular-nums">
						{Number(value).toFixed(1)}%
					</span>
				</div>
			)}
		/>
	);
}

function MetricChartTooltip({
	formatValue,
	labels,
	...tooltipProps
}: {
	formatValue: (value: number) => string;
	labels: Record<string, string>;
} & ComponentProps<typeof ChartTooltipContent>) {
	return (
		<ChartTooltipContent
			{...tooltipProps}
			indicator="dot"
			labelFormatter={(_, payload) =>
				formatTime(Number(payload[0]?.payload?.timeStamp))
			}
			formatter={(value, name) => (
				<div className="flex flex-1 items-center justify-between leading-none">
					<span className="text-muted-foreground">
						{labels[String(name)] ?? String(name)}
					</span>
					<span className="ml-2 font-medium text-foreground tabular-nums">
						{formatValue(Number(value))}
					</span>
				</div>
			)}
		/>
	);
}

function DualMetricLines({ first, second }: { first: string; second: string }) {
	return (
		<>
			<Line
				isAnimationActive={false}
				dataKey={first}
				type="linear"
				stroke="hsl(var(--chart-1))"
				strokeWidth={1}
				dot={false}
			/>
			<Line
				isAnimationActive={false}
				dataKey={second}
				type="linear"
				stroke="hsl(var(--chart-4))"
				strokeWidth={1}
				dot={false}
			/>
		</>
	);
}

function DualMetricHeader({
	first,
	second,
	widthClass,
}: {
	first: { label: string; value: string | number };
	second: { label: string; value: string | number };
	widthClass: string;
}) {
	return (
		<div className="flex items-center">
			<section className="flex items-center gap-4">
				{[first, second].map((metric, index) => (
					<div className={`flex flex-col ${widthClass}`} key={metric.label}>
						<p className="text-xs text-muted-foreground">{metric.label}</p>
						<div className="flex items-center gap-1">
							<span
								className={cn(
									"relative inline-flex size-1.5 rounded-full",
									index === 0
										? "bg-[hsl(var(--chart-1))]"
										: "bg-[hsl(var(--chart-4))]",
								)}
							/>
							<p className="text-xs font-medium">{metric.value}</p>
						</div>
					</div>
				))}
			</section>
		</div>
	);
}

function renderPercentAreaChart({
	color,
	data,
	dataKey,
	label,
}: {
	color: string;
	data: { timeStamp: string }[];
	dataKey: string;
	label: string;
}) {
	return (
		<AreaChart
			accessibilityLayer={false}
			data={data}
			margin={DETAIL_CHART_MARGIN}
		>
			<CartesianGrid vertical={false} />
			<XAxis {...DETAIL_TIME_AXIS_PROPS} />
			<YAxis {...DETAIL_PERCENT_AXIS_PROPS} />
			<ServerTimelineTooltip
				isAnimationActive={false}
				content={<PercentChartTooltip metricLabel={label} />}
			/>
			<Area
				isAnimationActive={false}
				dataKey={dataKey}
				type="step"
				fill={color}
				fillOpacity={0.3}
				stroke={color}
			/>
		</AreaChart>
	);
}

function PeriodSelector({
	selectedPeriod,
	onPeriodChange,
	isLogin,
	isTsdbEnabled,
}: {
	selectedPeriod: ChartPeriod;
	onPeriodChange: (period: ChartPeriod) => void;
	isLogin: boolean;
	isTsdbEnabled: boolean;
}) {
	const { t } = useTranslation();

	const periods = useMemo<{ value: ChartPeriod; label: string }[]>(
		() => [
			{ value: "realtime", label: t("serverDetailChart.realtime") },
			{ value: "1d", label: t("serverDetailChart.period1d") },
			{ value: "7d", label: t("serverDetailChart.period7d") },
			{ value: "30d", label: t("serverDetailChart.period30d") },
		],
		[t],
	);
	const periodValues = useMemo(
		() => periods.map((period) => period.value),
		[periods],
	);
	const { containerRef, enableIndicatorAnimation, indicator, setItemRef } =
		useActiveIndicator(periodValues, selectedPeriod);

	return (
		<TooltipProvider delayDuration={120}>
			<div
				ref={containerRef}
				className="relative flex gap-0.5 mb-3 flex-wrap sm:-mt-5 -mt-3 p-0.5 bg-muted dark:bg-muted/40 rounded-full w-fit border border-border/60 dark:border-border"
			>
				{indicator && (
					<div
						className="active-indicator-fade-in absolute left-0 top-0 z-10 bg-white dark:bg-background rounded-full ring-1 ring-border/60 dark:ring-border/40"
						style={{
							height: indicator.height,
							transform: `translate(${indicator.x}px, ${indicator.y}px)`,
							transition: indicator.shouldAnimate
								? "transform 0.5s var(--timing), width 0.5s var(--timing), height 0.5s var(--timing)"
								: "none",
							width: indicator.width,
						}}
					/>
				)}
				{periods.map((period, index) => {
					const isHistoryPeriod = period.value !== "realtime";
					const isLockedByTsdb = !isTsdbEnabled && isHistoryPeriod;
					// Only realtime and 1d are available for non-logged-in users
					const isLockedByLogin =
						!isLockedByTsdb &&
						!isLogin &&
						period.value !== "realtime" &&
						period.value !== "1d";
					const isLocked = isLockedByTsdb || isLockedByLogin;

					const periodItem = (
						<button
							key={period.value}
							type="button"
							disabled={isLocked}
							ref={setItemRef(index)}
							onClick={() => {
								if (selectedPeriod !== period.value) {
									enableIndicatorAnimation();
								}
								onPeriodChange(period.value);
							}}
							className={cn(
								"relative cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300",
								selectedPeriod === period.value
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground",
								isLocked && "cursor-not-allowed opacity-40 grayscale",
							)}
						>
							<span className="relative z-20 flex items-center gap-1.5">
								{period.value === "realtime" && (
									<span className="inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 dark:bg-emerald-400"></span>
								)}
								{period.label}
							</span>
						</button>
					);

					if (isLockedByTsdb || isLockedByLogin) {
						return (
							<Tooltip key={period.value}>
								<TooltipTrigger asChild>
									<span className="inline-flex">{periodItem}</span>
								</TooltipTrigger>
								<TooltipContent>
									{isLockedByTsdb
										? t(
												"serverDetailChart.tsdbRequired",
												"Enable TSDB to use historical data",
											)
										: t(
												"serverDetailChart.loginRequired",
												"Please login to view",
											)}
								</TooltipContent>
							</Tooltip>
						);
					}

					return periodItem;
				})}
			</div>
		</TooltipProvider>
	);
}

export default function ServerDetailChart({
	server_id,
}: {
	server_id: string;
}) {
	const { lastData, connected, messageHistory } = useWebSocketContext();
	const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>("realtime");
	const { isLogin } = useLoginProfile();

	const { data: settingData } = useQuery({
		queryKey: ["setting"],
		queryFn: ({ signal }) => fetchSetting(signal),
		refetchOnMount: false,
	});
	const isTsdbEnabled = settingData?.data?.tsdb_enabled ?? true;

	useEffect(() => {
		if (!isTsdbEnabled && selectedPeriod !== "realtime") {
			setSelectedPeriod("realtime");
		}
	}, [isTsdbEnabled, selectedPeriod]);

	useEffect(() => {
		if (
			isTsdbEnabled &&
			!isLogin &&
			selectedPeriod !== "realtime" &&
			selectedPeriod !== "1d"
		) {
			setSelectedPeriod("1d");
		}
	}, [isLogin, isTsdbEnabled, selectedPeriod]);

	if (!connected && !lastData) {
		return <ServerDetailChartLoading />;
	}

	const nezhaWsData = lastData;

	if (!nezhaWsData) {
		return <ServerDetailChartLoading />;
	}

	const server = nezhaWsData.servers.find((s) => s.id === Number(server_id));

	if (!server) {
		return <ServerDetailChartLoading />;
	}

	const gpuStats = server.state.gpu || [];
	const gpuList = server.host.gpu || [];

	return (
		<section className="flex flex-col">
			<PeriodSelector
				selectedPeriod={selectedPeriod}
				onPeriodChange={setSelectedPeriod}
				isLogin={isLogin}
				isTsdbEnabled={isTsdbEnabled}
			/>
			<ServerTimelineProvider>
				<section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
					<CpuChart
						now={nezhaWsData.now}
						data={server}
						messageHistory={messageHistory}
						period={selectedPeriod}
					/>
					{selectedPeriod === "realtime"
						? gpuStats.map((gpu, index) => (
								<GpuChart
									index={index}
									id={server.id}
									now={nezhaWsData.now}
									gpuStat={gpu}
									gpuName={gpuList[index] || `#${index + 1}`}
									messageHistory={messageHistory}
									period={selectedPeriod}
									key={`${server.id}-${index}`}
								/>
							))
						: (gpuStats.length > 0 || gpuList.length > 0) && (
								<GpuChart
									index={null}
									id={server.id}
									now={nezhaWsData.now}
									gpuStat={gpuStats.length > 0 ? Math.max(...gpuStats) : 0}
									messageHistory={messageHistory}
									period={selectedPeriod}
									key={`${server.id}-max`}
								/>
							)}
					<MemChart
						now={nezhaWsData.now}
						data={server}
						messageHistory={messageHistory}
						period={selectedPeriod}
					/>
					<DiskChart
						now={nezhaWsData.now}
						data={server}
						messageHistory={messageHistory}
						period={selectedPeriod}
					/>
					<ProcessChart
						now={nezhaWsData.now}
						data={server}
						messageHistory={messageHistory}
						period={selectedPeriod}
					/>
					<ThroughputChart
						now={nezhaWsData.now}
						data={server}
						messageHistory={messageHistory}
						period={selectedPeriod}
					/>
					<ConnectChart
						now={nezhaWsData.now}
						data={server}
						messageHistory={messageHistory}
						period={selectedPeriod}
					/>
				</section>
			</ServerTimelineProvider>
		</section>
	);
}

function useHistoricalData<T>(
	serverId: number,
	metricName: MetricType,
	period: ChartPeriod,
	transformData: (timestamp: number, value: number) => T,
) {
	const isHistorical = period !== "realtime";
	const query = useQuery({
		queryKey: ["server-metrics", serverId, metricName, period],
		enabled: isHistorical,
		queryFn: async ({ signal }) => {
			const response = await fetchServerMetrics(
				serverId,
				metricName,
				period as MetricPeriod,
				signal,
			);
			return response.success && response.data?.data_points
				? response.data.data_points.map((point) =>
						transformData(point.ts, point.value),
					)
				: [];
		},
	});

	return {
		displayData: query.data ?? [],
		isLoading: isHistorical && query.isPending,
	};
}

function useCombinedHistoricalData<T>(
	serverId: number,
	primaryMetric: MetricType,
	secondaryMetric: MetricType,
	period: ChartPeriod,
	combineData: (
		timestamp: number,
		primaryValue: number | null,
		secondaryValue: number | null,
	) => T,
) {
	const isHistorical = period !== "realtime";
	const query = useQuery({
		queryKey: [
			"server-metrics-combined",
			serverId,
			primaryMetric,
			secondaryMetric,
			period,
		],
		enabled: isHistorical,
		queryFn: async ({ signal }) => {
			const [primaryResponse, secondaryResponse] = await Promise.all([
				fetchServerMetrics(
					serverId,
					primaryMetric,
					period as MetricPeriod,
					signal,
				),
				fetchServerMetrics(
					serverId,
					secondaryMetric,
					period as MetricPeriod,
					signal,
				),
			]);

			const primaryPoints = primaryResponse.success
				? (primaryResponse.data?.data_points ?? [])
				: [];
			const secondaryPoints = secondaryResponse.success
				? (secondaryResponse.data?.data_points ?? [])
				: [];
			const primaryByTimestamp = new Map(
				primaryPoints.map((point) => [point.ts, point.value]),
			);
			const secondaryByTimestamp = new Map(
				secondaryPoints.map((point) => [point.ts, point.value]),
			);
			const timestamps = [
				...new Set([
					...primaryByTimestamp.keys(),
					...secondaryByTimestamp.keys(),
				]),
			].sort((a, b) => a - b);
			return timestamps.map((timestamp) =>
				combineData(
					timestamp,
					primaryByTimestamp.get(timestamp) ?? null,
					secondaryByTimestamp.get(timestamp) ?? null,
				),
			);
		},
	});

	return {
		displayData: query.data ?? [],
		isLoading: isHistorical && query.isPending,
	};
}

function useRealtimeChartData<T extends { timeStamp: string }>(
	serverId: number,
	messageHistory: NezhaWebsocketResponse[],
	period: ChartPeriod,
	buildPoint: (data: NezhaWebsocketResponse, server: NezhaServer) => T | null,
	currentPoint: T,
) {
	return useMemo(() => {
		if (period !== "realtime") return [];

		const historyData = messageHistory
			.slice(0, REALTIME_HISTORY_LIMIT)
			.map((wsData) => {
				const server = wsData.servers.find((item) => item.id === serverId);
				return server ? buildPoint(wsData, server) : null;
			})
			.filter((item): item is T => item !== null)
			.reverse();

		return appendRealtimePoint(historyData, currentPoint);
	}, [buildPoint, currentPoint, messageHistory, period, serverId]);
}

function GpuChart({
	id,
	index,
	gpuStat,
	gpuName,
	messageHistory,
	now,
	period,
}: {
	now: number;
	id: number;
	index: number | null;
	gpuStat: number;
	gpuName?: string;
	messageHistory: NezhaWebsocketResponse[];
	period: ChartPeriod;
}) {
	const transformGpuData = useMemo(
		() => (timestamp: number, value: number) => ({
			timeStamp: timestamp.toString(),
			gpu: value,
		}),
		[],
	);

	const { displayData: gpuHistoricalData, isLoading } =
		useHistoricalData<GpuChartData>(id, "gpu", period, transformGpuData);

	const buildGpuPoint = useCallback(
		(wsData: NezhaWebsocketResponse, server: NezhaServer) => {
			const gpuValues = formatNezhaInfo(wsData.now, server).gpu;
			const value = index === null ? Math.max(...gpuValues) : gpuValues[index];
			return Number.isFinite(value)
				? { timeStamp: wsData.now.toString(), gpu: value }
				: null;
		},
		[index],
	);
	const currentGpuPoint = useMemo(
		() => ({ timeStamp: now.toString(), gpu: gpuStat }),
		[gpuStat, now],
	);
	const gpuChartData = useRealtimeChartData(
		id,
		messageHistory,
		period,
		buildGpuPoint,
		currentGpuPoint,
	);

	const chartConfig = {
		gpu: {
			label: "GPU",
		},
	} satisfies ChartConfig;

	const displayData = period === "realtime" ? gpuChartData : gpuHistoricalData;

	return (
		<DetailChartCard
			config={chartConfig}
			isLoading={isLoading}
			timelineValues={displayData.map((item) => item.timeStamp)}
			header={
				<div className="flex items-center justify-between">
					<section className="flex flex-col items-center gap-2">
						{!gpuName && <p className="text-md font-medium">GPU</p>}
						{gpuName && <p className="text-xs mt-1 mb-1.5">GPU: {gpuName}</p>}
					</section>
					<section className="flex items-center gap-2">
						<p className="text-xs text-end w-10 font-medium">
							{gpuStat.toFixed(2)}%
						</p>
						<AnimatedCircularProgressBar
							className="size-3 text-[0px]"
							max={100}
							min={0}
							value={gpuStat}
							primaryColor="hsl(var(--chart-3))"
						/>
					</section>
				</div>
			}
		>
			{renderPercentAreaChart({
				color: "hsl(var(--chart-3))",
				data: displayData,
				dataKey: "gpu",
				label: "GPU",
			})}
		</DetailChartCard>
	);
}

function CpuChart({
	now,
	data,
	messageHistory,
	period,
}: {
	now: number;
	data: NezhaServer;
	messageHistory: NezhaWebsocketResponse[];
	period: ChartPeriod;
}) {
	const { cpu } = formatNezhaInfo(now, data);

	const transformCpuData = useMemo(
		() => (timestamp: number, value: number) => ({
			timeStamp: timestamp.toString(),
			cpu: value,
		}),
		[],
	);

	const { displayData: cpuHistoricalData, isLoading } =
		useHistoricalData<CpuChartData>(data.id, "cpu", period, transformCpuData);

	const buildCpuPoint = useCallback(
		(wsData: NezhaWebsocketResponse, server: NezhaServer) => ({
			timeStamp: wsData.now.toString(),
			cpu: formatNezhaInfo(wsData.now, server).cpu,
		}),
		[],
	);
	const currentCpuPoint = useMemo(
		() => ({ timeStamp: now.toString(), cpu }),
		[cpu, now],
	);
	const cpuChartData = useRealtimeChartData(
		data.id,
		messageHistory,
		period,
		buildCpuPoint,
		currentCpuPoint,
	);

	const chartConfig = {
		cpu: {
			label: "CPU",
		},
	} satisfies ChartConfig;

	const displayData = period === "realtime" ? cpuChartData : cpuHistoricalData;

	return (
		<DetailChartCard
			config={chartConfig}
			isLoading={isLoading}
			timelineValues={displayData.map((item) => item.timeStamp)}
			header={
				<div className="flex items-center justify-between">
					<p className="text-md font-medium">CPU</p>
					<section className="flex items-center gap-2">
						<p className="text-xs text-end w-10 font-medium">
							{cpu.toFixed(2)}%
						</p>
						<AnimatedCircularProgressBar
							className="size-3 text-[0px]"
							max={100}
							min={0}
							value={cpu}
							primaryColor="hsl(var(--chart-1))"
						/>
					</section>
				</div>
			}
		>
			{renderPercentAreaChart({
				color: "hsl(var(--chart-1))",
				data: displayData,
				dataKey: "cpu",
				label: "CPU",
			})}
		</DetailChartCard>
	);
}

function ProcessChart({
	now,
	data,
	messageHistory,
	period,
}: {
	now: number;
	data: NezhaServer;
	messageHistory: NezhaWebsocketResponse[];
	period: ChartPeriod;
}) {
	const { t } = useTranslation();
	const { process } = formatNezhaInfo(now, data);

	const transformProcessData = useMemo(
		() => (timestamp: number, value: number) => ({
			timeStamp: timestamp.toString(),
			process: value,
		}),
		[],
	);

	const { displayData: processHistoricalData, isLoading } =
		useHistoricalData<ProcessChartData>(
			data.id,
			"process_count",
			period,
			transformProcessData,
		);

	const buildProcessPoint = useCallback(
		(wsData: NezhaWebsocketResponse, server: NezhaServer) => ({
			timeStamp: wsData.now.toString(),
			process: formatNezhaInfo(wsData.now, server).process,
		}),
		[],
	);
	const currentProcessPoint = useMemo(
		() => ({ timeStamp: now.toString(), process }),
		[now, process],
	);
	const processChartData = useRealtimeChartData(
		data.id,
		messageHistory,
		period,
		buildProcessPoint,
		currentProcessPoint,
	);

	const chartConfig = {
		process: {
			label: "Process",
		},
	} satisfies ChartConfig;

	const displayData =
		period === "realtime" ? processChartData : processHistoricalData;

	return (
		<DetailChartCard
			config={chartConfig}
			isLoading={isLoading}
			timelineValues={displayData.map((item) => item.timeStamp)}
			header={
				<div className="flex items-center justify-between">
					<p className="text-md font-medium">
						{t("serverDetailChart.process")}
					</p>
					<section className="flex items-center gap-2">
						<p className="text-xs text-end w-10 font-medium">{process}</p>
					</section>
				</div>
			}
		>
			<AreaChart
				accessibilityLayer={false}
				data={displayData}
				margin={DETAIL_CHART_MARGIN}
			>
				<CartesianGrid vertical={false} />
				<XAxis {...DETAIL_TIME_AXIS_PROPS} />
				<YAxis
					tickLine={false}
					axisLine={false}
					mirror={true}
					tickMargin={-15}
				/>
				<ServerTimelineTooltip
					isAnimationActive={false}
					content={
						<MetricChartTooltip
							formatValue={(value) => value.toFixed(0)}
							labels={{ process: t("serverDetailChart.process") }}
						/>
					}
				/>
				<Area
					isAnimationActive={false}
					dataKey="process"
					type="step"
					fill="hsl(var(--chart-2))"
					fillOpacity={0.3}
					stroke="hsl(var(--chart-2))"
				/>
			</AreaChart>
		</DetailChartCard>
	);
}

function MemChart({
	now,
	data,
	messageHistory,
	period,
}: {
	now: number;
	data: NezhaServer;
	messageHistory: NezhaWebsocketResponse[];
	period: ChartPeriod;
}) {
	const { t } = useTranslation();
	const { mem, swap } = formatNezhaInfo(now, data);

	const combineMemoryData = useMemo(
		() =>
			(
				timestamp: number,
				memoryValue: number | null,
				swapValue: number | null,
			) => ({
				timeStamp: timestamp.toString(),
				mem:
					memoryValue === null
						? null
						: data.host.mem_total > 0
							? (memoryValue / data.host.mem_total) * 100
							: 0,
				swap:
					swapValue === null
						? null
						: data.host.swap_total > 0
							? (swapValue / data.host.swap_total) * 100
							: 0,
			}),
		[data.host.mem_total, data.host.swap_total],
	);
	const { displayData: memHistoricalData, isLoading: isMemLoading } =
		useCombinedHistoricalData(
			data.id,
			"memory",
			"swap",
			period,
			combineMemoryData,
		);

	const buildMemoryPoint = useCallback(
		(wsData: NezhaWebsocketResponse, server: NezhaServer) => {
			const values = formatNezhaInfo(wsData.now, server);
			return {
				timeStamp: wsData.now.toString(),
				mem: values.mem,
				swap: values.swap,
			};
		},
		[],
	);
	const currentMemoryPoint = useMemo(
		() => ({ timeStamp: now.toString(), mem, swap }),
		[mem, now, swap],
	);
	const memChartData = useRealtimeChartData(
		data.id,
		messageHistory,
		period,
		buildMemoryPoint,
		currentMemoryPoint,
	);

	const chartConfig = {
		mem: {
			label: "Mem",
		},
		swap: {
			label: "Swap",
		},
	} satisfies ChartConfig;

	const displayData = period === "realtime" ? memChartData : memHistoricalData;

	return (
		<DetailChartCard
			config={chartConfig}
			isLoading={isMemLoading}
			timelineValues={displayData.map((item) => item.timeStamp)}
			header={
				<div className="flex items-center justify-between">
					<section className="flex items-center gap-4">
						<div className="flex flex-col">
							<p className=" text-xs text-muted-foreground">
								{t("serverDetailChart.mem")}
							</p>
							<div className="flex items-center gap-2">
								<AnimatedCircularProgressBar
									className="size-3 text-[0px]"
									max={100}
									min={0}
									value={mem}
									primaryColor="hsl(var(--chart-8))"
								/>
								<p className="text-xs font-medium">{mem.toFixed(0)}%</p>
							</div>
						</div>
						<div className="flex flex-col">
							<p className=" text-xs text-muted-foreground">
								{t("serverDetailChart.swap")}
							</p>
							<div className="flex items-center gap-2">
								<AnimatedCircularProgressBar
									className="size-3 text-[0px]"
									max={100}
									min={0}
									value={swap}
									primaryColor="hsl(var(--chart-10))"
								/>
								<p className="text-xs font-medium">{swap.toFixed(0)}%</p>
							</div>
						</div>
					</section>
					<section className="flex flex-col items-end gap-0.5">
						<div className="flex text-[11px] font-medium items-center gap-2">
							{formatSakuraBytes(data.state.mem_used)} /{" "}
							{formatSakuraBytes(data.host.mem_total)}
						</div>
						<div className="flex text-[11px] font-medium items-center gap-2">
							{data.host.swap_total ? (
								<>
									swap: {formatSakuraBytes(data.state.swap_used)} /{" "}
									{formatSakuraBytes(data.host.swap_total)}
								</>
							) : (
								<>no swap</>
							)}
						</div>
					</section>
				</div>
			}
		>
			<AreaChart
				accessibilityLayer={false}
				data={displayData}
				margin={DETAIL_CHART_MARGIN}
			>
				<CartesianGrid vertical={false} />
				<XAxis {...DETAIL_TIME_AXIS_PROPS} />
				<YAxis {...DETAIL_PERCENT_AXIS_PROPS} />
				<ServerTimelineTooltip
					isAnimationActive={false}
					content={
						<MetricChartTooltip
							formatValue={(value) => `${value.toFixed(1)}%`}
							labels={{
								mem: t("serverDetailChart.mem"),
								swap: t("serverDetailChart.swap"),
							}}
						/>
					}
				/>
				<Area
					isAnimationActive={false}
					dataKey="mem"
					type="step"
					fill="hsl(var(--chart-8))"
					fillOpacity={0.3}
					stroke="hsl(var(--chart-8))"
				/>
				<Area
					isAnimationActive={false}
					dataKey="swap"
					type="step"
					fill="hsl(var(--chart-10))"
					fillOpacity={0.3}
					stroke="hsl(var(--chart-10))"
				/>
			</AreaChart>
		</DetailChartCard>
	);
}

function DiskChart({
	now,
	data,
	messageHistory,
	period,
}: {
	now: number;
	data: NezhaServer;
	messageHistory: NezhaWebsocketResponse[];
	period: ChartPeriod;
}) {
	const { t } = useTranslation();
	const { disk } = formatNezhaInfo(now, data);

	const transformDiskData = useMemo(
		() => (timestamp: number, value: number) => {
			// Convert bytes to percentage
			const diskPercent =
				data.host.disk_total > 0 ? (value / data.host.disk_total) * 100 : 0;
			return {
				timeStamp: timestamp.toString(),
				disk: diskPercent,
			};
		},
		[data.host.disk_total],
	);

	const { displayData: diskHistoricalData, isLoading } =
		useHistoricalData<DiskChartData>(
			data.id,
			"disk",
			period,
			transformDiskData,
		);

	const buildDiskPoint = useCallback(
		(wsData: NezhaWebsocketResponse, server: NezhaServer) => ({
			timeStamp: wsData.now.toString(),
			disk: formatNezhaInfo(wsData.now, server).disk,
		}),
		[],
	);
	const currentDiskPoint = useMemo(
		() => ({ timeStamp: now.toString(), disk }),
		[disk, now],
	);
	const diskChartData = useRealtimeChartData(
		data.id,
		messageHistory,
		period,
		buildDiskPoint,
		currentDiskPoint,
	);

	const chartConfig = {
		disk: {
			label: "Disk",
		},
	} satisfies ChartConfig;

	const displayData =
		period === "realtime" ? diskChartData : diskHistoricalData;

	return (
		<DetailChartCard
			config={chartConfig}
			isLoading={isLoading}
			timelineValues={displayData.map((item) => item.timeStamp)}
			header={
				<div className="flex items-center justify-between">
					<p className="text-md font-medium">{t("serverDetailChart.disk")}</p>
					<section className="flex flex-col items-end gap-0.5">
						<section className="flex items-center gap-2">
							<p className="text-xs text-end w-10 font-medium">
								{disk.toFixed(0)}%
							</p>
							<AnimatedCircularProgressBar
								className="size-3 text-[0px]"
								max={100}
								min={0}
								value={disk}
								primaryColor="hsl(var(--chart-5))"
							/>
						</section>
						<div className="flex text-[11px] font-medium items-center gap-2">
							{formatSakuraBytes(data.state.disk_used)} /{" "}
							{formatSakuraBytes(data.host.disk_total)}
						</div>
					</section>
				</div>
			}
		>
			{renderPercentAreaChart({
				color: "hsl(var(--chart-5))",
				data: displayData,
				dataKey: "disk",
				label: t("serverDetailChart.disk"),
			})}
		</DetailChartCard>
	);
}

function ThroughputChart({
	now,
	data,
	messageHistory,
	period,
}: {
	now: number;
	data: NezhaServer;
	messageHistory: NezhaWebsocketResponse[];
	period: ChartPeriod;
}) {
	const { t } = useTranslation();
	const { up, down } = formatNezhaInfo(now, data);

	const combineNetworkData = useMemo(
		() =>
			(
				timestamp: number,
				uploadValue: number | null,
				downloadValue: number | null,
			) => ({
				timeStamp: timestamp.toString(),
				upload: uploadValue === null ? null : uploadValue / 1024 / 1024,
				download: downloadValue === null ? null : downloadValue / 1024 / 1024,
			}),
		[],
	);
	const { displayData: networkHistoricalData, isLoading: isNetworkLoading } =
		useCombinedHistoricalData(
			data.id,
			"net_out_speed",
			"net_in_speed",
			period,
			combineNetworkData,
		);

	const buildNetworkPoint = useCallback(
		(wsData: NezhaWebsocketResponse, server: NezhaServer) => {
			const values = formatNezhaInfo(wsData.now, server);
			return {
				timeStamp: wsData.now.toString(),
				upload: values.up,
				download: values.down,
			};
		},
		[],
	);
	const currentNetworkPoint = useMemo(
		() => ({ timeStamp: now.toString(), upload: up, download: down }),
		[down, now, up],
	);
	const networkChartData = useRealtimeChartData(
		data.id,
		messageHistory,
		period,
		buildNetworkPoint,
		currentNetworkPoint,
	);

	const displayData =
		period === "realtime" ? networkChartData : networkHistoricalData;

	const maxRate = Math.max(
		1,
		Math.ceil(
			displayData.reduce(
				(maximum, item) =>
					Math.max(maximum, item.upload ?? 0, item.download ?? 0),
				0,
			),
		),
	);

	const chartConfig = {
		upload: {
			label: "Upload",
		},
		download: {
			label: "Download",
		},
	} satisfies ChartConfig;

	return (
		<DetailChartCard
			config={chartConfig}
			isLoading={isNetworkLoading}
			timelineValues={displayData.map((item) => item.timeStamp)}
			header={
				<DualMetricHeader
					first={{
						label: t("serverDetailChart.upload"),
						value:
							up >= 1024
								? `${(up / 1024).toFixed(2)}G/s`
								: up >= 1
									? `${up.toFixed(2)}M/s`
									: `${(up * 1024).toFixed(2)}K/s`,
					}}
					second={{
						label: t("serverDetailChart.download"),
						value:
							down >= 1024
								? `${(down / 1024).toFixed(2)}G/s`
								: down >= 1
									? `${down.toFixed(2)}M/s`
									: `${(down * 1024).toFixed(2)}K/s`,
					}}
					widthClass="w-20"
				/>
			}
		>
			<LineChart
				accessibilityLayer={false}
				data={displayData}
				margin={DETAIL_CHART_MARGIN}
			>
				<CartesianGrid vertical={false} />
				<XAxis {...DETAIL_TIME_AXIS_PROPS} />
				<YAxis
					tickLine={false}
					axisLine={false}
					mirror={true}
					tickMargin={-15}
					type="number"
					minTickGap={50}
					interval="preserveStartEnd"
					domain={[0, maxRate]}
					tickFormatter={(value) => `${value.toFixed(0)}M/s`}
				/>
				<ServerTimelineTooltip
					isAnimationActive={false}
					content={
						<MetricChartTooltip
							formatValue={(value) => `${value.toFixed(2)} MB/s`}
							labels={{
								download: t("serverDetailChart.download"),
								upload: t("serverDetailChart.upload"),
							}}
						/>
					}
				/>
				<DualMetricLines first="upload" second="download" />
			</LineChart>
		</DetailChartCard>
	);
}

function ConnectChart({
	now,
	data,
	messageHistory,
	period,
}: {
	now: number;
	data: NezhaServer;
	messageHistory: NezhaWebsocketResponse[];
	period: ChartPeriod;
}) {
	const { tcp, udp } = formatNezhaInfo(now, data);

	const combineConnectionData = useMemo(
		() =>
			(
				timestamp: number,
				tcpValue: number | null,
				udpValue: number | null,
			) => ({
				timeStamp: timestamp.toString(),
				tcp: tcpValue,
				udp: udpValue,
			}),
		[],
	);
	const { displayData: connectHistoricalData, isLoading: isConnectLoading } =
		useCombinedHistoricalData(
			data.id,
			"tcp_conn",
			"udp_conn",
			period,
			combineConnectionData,
		);

	const buildConnectionPoint = useCallback(
		(wsData: NezhaWebsocketResponse, server: NezhaServer) => {
			const values = formatNezhaInfo(wsData.now, server);
			return {
				timeStamp: wsData.now.toString(),
				tcp: values.tcp,
				udp: values.udp,
			};
		},
		[],
	);
	const currentConnectionPoint = useMemo(
		() => ({ timeStamp: now.toString(), tcp, udp }),
		[now, tcp, udp],
	);
	const connectChartData = useRealtimeChartData(
		data.id,
		messageHistory,
		period,
		buildConnectionPoint,
		currentConnectionPoint,
	);

	const chartConfig = {
		tcp: {
			label: "TCP",
		},
		udp: {
			label: "UDP",
		},
	} satisfies ChartConfig;

	const displayData =
		period === "realtime" ? connectChartData : connectHistoricalData;

	return (
		<DetailChartCard
			config={chartConfig}
			isLoading={isConnectLoading}
			timelineValues={displayData.map((item) => item.timeStamp)}
			header={
				<DualMetricHeader
					first={{ label: "TCP", value: tcp }}
					second={{ label: "UDP", value: udp }}
					widthClass="w-12"
				/>
			}
		>
			<LineChart
				accessibilityLayer={false}
				data={displayData}
				margin={DETAIL_CHART_MARGIN}
			>
				<CartesianGrid vertical={false} />
				<XAxis {...DETAIL_TIME_AXIS_PROPS} />
				<YAxis
					tickLine={false}
					axisLine={false}
					mirror={true}
					tickMargin={-15}
					type="number"
					interval="preserveStartEnd"
				/>
				<ServerTimelineTooltip
					isAnimationActive={false}
					content={
						<MetricChartTooltip
							formatValue={(value) => value.toFixed(0)}
							labels={{ tcp: "TCP", udp: "UDP" }}
						/>
					}
				/>
				<DualMetricLines first="tcp" second="udp" />
			</LineChart>
		</DetailChartCard>
	);
}
