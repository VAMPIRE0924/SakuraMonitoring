import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import * as React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	XAxis,
	YAxis,
} from "recharts";
import {
	ServerTimelineChart,
	ServerTimelineProvider,
	ServerTimelineTooltip,
} from "@/components/ServerTimelineChart";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartLegend,
	ChartLegendContent,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveIndicator } from "@/hooks/use-active-indicator";
import { useLoginProfile } from "@/hooks/use-login-profile";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import { fetchMonitor, type MonitorPeriod } from "@/lib/nezha-api";
import { getServiceNameForPanel } from "@/lib/service-visibility";
import { cn, formatTime } from "@/lib/utils";
import type { NezhaMonitor, ServerMonitorChart } from "@/types/nezha-api";
import NetworkChartLoading from "./NetworkChartLoading";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

interface ResultItem {
	created_at: number;
	[key: string]: number | null;
}

const MIN_PERIOD_LOADING_MS = 500;

function prepareMonitorData(data: NezhaMonitor[]) {
	const chartData: ServerMonitorChart = {};
	const formattedByTime = new Map<number, ResultItem>();
	const monitorInfoByKey = new Map<
		string,
		{ id: number; displayIndex?: number }
	>();
	const chartLabels: Record<string, string> = {};
	let serverName = "";

	for (const item of data) {
		const pointCount = Math.min(item.created_at.length, item.avg_delay.length);
		if (pointCount === 0) continue;

		serverName ||= item.server_name;
		const monitorKey = `monitor:${item.monitor_id}`;
		monitorInfoByKey.set(monitorKey, {
			id: item.monitor_id,
			displayIndex: item.display_index,
		});
		chartLabels[monitorKey] = item.monitor_name;
		const series = chartData[monitorKey] ?? [];

		for (let index = 0; index < pointCount; index += 1) {
			const createdAt = item.created_at[index];
			const averageDelay = item.avg_delay[index];
			const packetLoss = item.packet_loss?.[index];
			series.push({
				created_at: createdAt,
				avg_delay: averageDelay,
				...(Number.isFinite(packetLoss) ? { packet_loss: packetLoss } : {}),
			});
			const formatted = formattedByTime.get(createdAt) ?? {
				created_at: createdAt,
			};
			formatted[monitorKey] = averageDelay;
			formattedByTime.set(createdAt, formatted);
		}

		chartData[monitorKey] = series;
	}

	const chartDataKey = Object.keys(chartData).sort((a, b) => {
		const aInfo = monitorInfoByKey.get(a);
		const bInfo = monitorInfoByKey.get(b);
		if (!aInfo && !bInfo) return a.localeCompare(b);
		if (!aInfo) return 1;
		if (!bInfo) return -1;

		const indexDiff = (bInfo.displayIndex ?? 0) - (aInfo.displayIndex ?? 0);
		return indexDiff || aInfo.id - bInfo.id;
	});

	return {
		chartData,
		chartDataKey,
		chartLabels,
		formattedData: [...formattedByTime.values()].sort(
			(a, b) => a.created_at - b.created_at,
		),
		serverName,
	};
}

function NetworkChartEmpty({ message }: { message: string }) {
	return (
		<div className="flex min-h-62.5 items-center justify-center">
			<p className="text-sm font-medium opacity-40">{message}</p>
		</div>
	);
}

const PEAK_WINDOW_SIZE = 11;
const PEAK_ALPHA = 0.3;

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
}

function robustSmoothedValue(values: number[]) {
	const center = median(values);
	const medianDeviation =
		median(values.map((value) => Math.abs(value - center))) * 1.4826;
	const validValues = values.filter(
		(value) =>
			Math.abs(value - center) <= 3 * medianDeviation && value <= center * 3,
	);
	if (validValues.length === 0) return center;

	let smoothed = validValues[0];
	for (let index = 1; index < validValues.length; index += 1) {
		smoothed = PEAK_ALPHA * validValues[index] + (1 - PEAK_ALPHA) * smoothed;
	}
	return smoothed;
}

function smoothPeakData(data: ResultItem[], keys: string[]) {
	const history: Record<string, number> = {};
	return data.map((point, index) => {
		if (index < PEAK_WINDOW_SIZE - 1) return point;

		const window = data.slice(index - PEAK_WINDOW_SIZE + 1, index + 1);
		const smoothed = { ...point };
		for (const key of keys) {
			const values = window.flatMap((item) => {
				const value = item[key];
				return typeof value === "number" ? [value] : [];
			});
			if (values.length === 0) continue;

			const processed = robustSmoothedValue(values);
			history[key] =
				history[key] === undefined
					? processed
					: PEAK_ALPHA * processed + (1 - PEAK_ALPHA) * history[key];
			smoothed[key] = history[key];
		}
		return smoothed;
	});
}

function selectTimeTicks(data: ResultItem[], period: MonitorPeriod) {
	if (data.length === 0) return [];

	const targetCount = period === "30d" ? 7 : 8;
	if (data.length <= targetCount) {
		return data.map((item) => item.created_at);
	}

	const lastIndex = data.length - 1;
	return Array.from({ length: targetCount }, (_, index) =>
		Math.round((index * lastIndex) / (targetCount - 1)),
	)
		.filter((dataIndex, index, indexes) => indexes.indexOf(dataIndex) === index)
		.map((dataIndex) => data[dataIndex].created_at);
}

function formatChartTick(value: number, period: MonitorPeriod) {
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "";

	const monthAndDay = `${date.getMonth() + 1}/${date.getDate()}`;
	if (period === "7d" || period === "30d") return monthAndDay;

	const time = `${String(date.getHours()).padStart(2, "0")}:${String(
		date.getMinutes(),
	).padStart(2, "0")}`;
	return time;
}

export function NetworkChart({ server_id }: { server_id: number }) {
	const { t } = useTranslation();
	const [period, setPeriod] = React.useState<MonitorPeriod>("1d");
	const { isLogin } = useLoginProfile();

	React.useEffect(() => {
		if (!isLogin && period !== "1d") {
			setPeriod("1d");
		}
	}, [isLogin, period]);

	const {
		data: monitorData,
		isError: isMonitorError,
		isPending: isMonitorPending,
		isPlaceholderData,
	} = useQuery({
		queryKey: ["monitor", server_id, period],
		queryFn: ({ signal }) => fetchMonitor(server_id, period, signal),
		placeholderData: (previousData, previousQuery) =>
			previousQuery?.queryKey[1] === server_id ? previousData : undefined,
		refetchInterval: 10000,
	});
	const preparedData = useMemo(
		() =>
			prepareMonitorData(
				monitorData?.success && Array.isArray(monitorData.data)
					? monitorData.data
							.map((monitor) => {
								const name = getServiceNameForPanel(
									monitor.monitor_name,
									"network",
								);
								return name === null
									? null
									: {
											...monitor,
											monitor_name: name || String(monitor.monitor_id),
										};
							})
							.filter((monitor) => monitor !== null)
					: [],
			),
		[monitorData],
	);

	if (isMonitorPending) return <NetworkChartLoading />;

	if (
		isMonitorError ||
		monitorData?.success !== true ||
		preparedData.chartDataKey.length === 0
	) {
		return <NetworkChartEmpty message={t("monitor.noData")} />;
	}

	const initChartConfig = {
		avg_delay: {
			label: t("monitor.avgDelay"),
		},
		...preparedData.chartDataKey.reduce((acc, key) => {
			acc[key] = {
				label: preparedData.chartLabels[key],
			};
			return acc;
		}, {} as ChartConfig),
	} satisfies ChartConfig;

	return (
		<NetworkChartClient
			chartDataKey={preparedData.chartDataKey}
			chartConfig={initChartConfig}
			chartData={preparedData.chartData}
			chartLabels={preparedData.chartLabels}
			serverName={preparedData.serverName}
			formattedData={preparedData.formattedData}
			isPeriodLoading={isPlaceholderData}
			period={period}
			onPeriodChange={setPeriod}
			isLogin={isLogin}
		/>
	);
}

export const NetworkChartClient = React.memo(function NetworkChartClient({
	chartDataKey,
	chartConfig,
	chartData,
	chartLabels,
	serverName,
	formattedData,
	isPeriodLoading,
	period,
	onPeriodChange,
	isLogin,
}: {
	chartDataKey: string[];
	chartConfig: ChartConfig;
	chartData: ServerMonitorChart;
	chartLabels?: Record<string, string>;
	serverName: string;
	formattedData: ResultItem[];
	isPeriodLoading: boolean;
	period: MonitorPeriod;
	onPeriodChange: (period: MonitorPeriod) => void;
	isLogin: boolean;
}) {
	const { t } = useTranslation();
	const getChartLabel = useCallback(
		(key: string) => chartLabels?.[key] ?? key,
		[chartLabels],
	);
	const [showPeriodLoading, setShowPeriodLoading] = React.useState(false);
	const loadingStartedAtRef = React.useRef<number | null>(null);

	const TIME_RANGE_OPTIONS = useMemo<{ value: MonitorPeriod; label: string }[]>(
		() => [
			{ value: "1d", label: t("monitor.period1d") },
			{ value: "7d", label: t("monitor.period7d") },
			{ value: "30d", label: t("monitor.period30d") },
		],
		[t],
	);
	const timeRangeValues = useMemo(
		() => TIME_RANGE_OPTIONS.map((option) => option.value),
		[TIME_RANGE_OPTIONS],
	);
	const { containerRef, enableIndicatorAnimation, indicator, setItemRef } =
		useActiveIndicator(timeRangeValues, period);

	React.useEffect(() => {
		let timeoutId: number | undefined;

		if (isPeriodLoading) {
			loadingStartedAtRef.current = Date.now();
			setShowPeriodLoading(true);
			return;
		}

		const loadingStartedAt = loadingStartedAtRef.current;
		if (loadingStartedAt === null) {
			setShowPeriodLoading(false);
			return;
		}

		const elapsed = Date.now() - loadingStartedAt;
		const remaining = Math.max(0, MIN_PERIOD_LOADING_MS - elapsed);

		timeoutId = window.setTimeout(() => {
			setShowPeriodLoading(false);
			loadingStartedAtRef.current = null;
		}, remaining);

		return () => {
			if (timeoutId !== undefined) {
				window.clearTimeout(timeoutId);
			}
		};
	}, [isPeriodLoading]);

	const { forcePeakCutEnabled } = useSakuraRuntimeConfig();

	const [activeCharts, setActiveCharts] = React.useState<string[]>([]);
	const [isPeakEnabled, setIsPeakEnabled] = React.useState(forcePeakCutEnabled);

	React.useEffect(() => {
		setIsPeakEnabled(forcePeakCutEnabled);
	}, [forcePeakCutEnabled]);

	React.useEffect(() => {
		setActiveCharts((current) => {
			const valid = current.filter((chart) => chartDataKey.includes(chart));
			return valid.length === current.length ? current : valid;
		});
	}, [chartDataKey]);

	const clearAllSelections = useCallback(() => {
		setActiveCharts([]);
	}, []);

	const handleButtonClick = useCallback((chart: string) => {
		setActiveCharts((prev) => {
			if (prev.includes(chart)) {
				return prev.filter((c) => c !== chart);
			}
			return [...prev, chart];
		});
	}, []);

	const colorIndexByChart = useMemo(
		() => new Map(chartDataKey.map((chart, index) => [chart, index])),
		[chartDataKey],
	);

	const getColorByIndex = useCallback(
		(chart: string) => {
			const index = colorIndexByChart.get(chart) ?? 0;
			return `hsl(var(--chart-${(index % 10) + 1}))`;
		},
		[colorIndexByChart],
	);

	const chartStats = useMemo(() => {
		const stats: { [key: string]: { minDelay: number; maxDelay: number } } = {};

		for (const key of chartDataKey) {
			const data = chartData[key] || [];
			if (data.length > 0) {
				let minDelay = Number.POSITIVE_INFINITY;
				let maxDelay = Number.NEGATIVE_INFINITY;
				for (const item of data) {
					minDelay = Math.min(minDelay, item.avg_delay);
					maxDelay = Math.max(maxDelay, item.avg_delay);
				}
				stats[key] = { minDelay, maxDelay };
			} else {
				stats[key] = { minDelay: 0, maxDelay: 0 };
			}
		}

		return stats;
	}, [chartDataKey, chartData]);

	const chartButtons = useMemo(
		() =>
			chartDataKey.map((key) => {
				const monitorData = chartData[key];
				const lastDelay = monitorData[monitorData.length - 1].avg_delay;
				const stats = chartStats[key];

				const packetLossData = monitorData.flatMap((item) =>
					item.packet_loss === undefined ? [] : [item.packet_loss],
				);
				const avgPacketLoss =
					packetLossData.length > 0
						? packetLossData.reduce((sum, loss) => sum + loss, 0) /
							packetLossData.length
						: null;

				return (
					<button
						type="button"
						key={key}
						data-active={activeCharts.includes(key)}
						aria-pressed={activeCharts.includes(key)}
						className={`relative z-30 flex cursor-pointer grow basis-0 flex-col justify-center gap-1 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 text-left data-[active=true]:bg-muted/50 sm:border-l sm:border-t-0 sm:px-6`}
						onClick={() => handleButtonClick(key)}
					>
						<span className="whitespace-nowrap text-xs text-muted-foreground">
							{getChartLabel(key)}
						</span>
						<div className="flex flex-col gap-0.5">
							<span className="text-md font-semibold leading-none sm:text-xl">
								{lastDelay.toFixed(2)}ms
							</span>
							<div className="flex items-center gap-2 text-[12px]">
								<span className="flex items-center text-green-600 dark:text-green-400">
									<ArrowDown aria-hidden className="size-3" />
									{stats.minDelay.toFixed(0)}
								</span>
								<span className="flex items-center text-red-600 dark:text-red-500">
									<ArrowUp aria-hidden className="size-3" />
									{stats.maxDelay.toFixed(0)}
								</span>
								{avgPacketLoss !== null && (
									<span className="text-muted-foreground flex items-center gap-1">
										{avgPacketLoss.toFixed(2)}%
									</span>
								)}
							</div>
						</div>
					</button>
				);
			}),
		[
			chartDataKey,
			activeCharts,
			chartData,
			chartStats,
			handleButtonClick,
			getChartLabel,
		],
	);
	const selectedHasPacketLoss = useMemo(() => {
		if (activeCharts.length !== 1) return false;
		return (chartData[activeCharts[0]] ?? []).some(
			(point) => point.packet_loss !== undefined,
		);
	}, [activeCharts, chartData]);

	const chartElements = useMemo(() => {
		const elements = [];

		if (activeCharts.length === 1) {
			const chart = activeCharts[0];
			if (selectedHasPacketLoss) {
				elements.push(
					<Area
						key="packet-loss-area"
						isAnimationActive={false}
						dataKey="packet_loss"
						stroke="none"
						fill="hsl(45, 100%, 60%)"
						fillOpacity={0.3}
						yAxisId="packet-loss"
					/>,
				);
			}
			elements.push(
				<Line
					key="delay-line"
					isAnimationActive={false}
					strokeWidth={1}
					type="linear"
					dot={false}
					dataKey="avg_delay"
					stroke={getColorByIndex(chart)}
					yAxisId="delay"
					connectNulls={true}
				/>,
			);
		} else if (activeCharts.length > 1) {
			elements.push(
				...activeCharts.map((chart) => (
					<Line
						key={chart}
						isAnimationActive={false}
						strokeWidth={1}
						type="linear"
						dot={false}
						dataKey={chart}
						stroke={getColorByIndex(chart)}
						name={getChartLabel(chart)}
						connectNulls={true}
						yAxisId="delay"
					/>
				)),
			);
		} else {
			elements.push(
				...chartDataKey.map((key) => (
					<Line
						key={key}
						isAnimationActive={false}
						strokeWidth={1}
						type="linear"
						dot={false}
						dataKey={key}
						stroke={getColorByIndex(key)}
						connectNulls={true}
						yAxisId="delay"
					/>
				)),
			);
		}

		return elements;
	}, [
		activeCharts,
		chartDataKey,
		getChartLabel,
		getColorByIndex,
		selectedHasPacketLoss,
	]);

	const processedData = useMemo(() => {
		const selectedChart = activeCharts.length === 1 ? activeCharts[0] : null;
		const baseData = selectedChart
			? (chartData[selectedChart] ?? []).map((item) => ({
					created_at: item.created_at,
					avg_delay: item.avg_delay,
					...(item.packet_loss === undefined
						? {}
						: { packet_loss: item.packet_loss }),
				}))
			: formattedData;
		if (!isPeakEnabled) return baseData;

		const keys = selectedChart
			? ["avg_delay"]
			: activeCharts.length > 0
				? activeCharts
				: chartDataKey;
		return smoothPeakData(baseData, keys);
	}, [isPeakEnabled, activeCharts, formattedData, chartData, chartDataKey]);
	const xAxisTicks = useMemo(
		() => selectTimeTicks(processedData, period),
		[period, processedData],
	);
	const formatXAxisTick = useCallback(
		(value: number) => formatChartTick(value, period),
		[period],
	);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3 sm:-mt-5 -mt-3 flex-wrap">
				<TooltipProvider delayDuration={120}>
					<div
						ref={containerRef}
						className="relative flex items-center gap-1 rounded-full bg-muted dark:bg-muted/40 p-0.5 border border-border/60 dark:border-border"
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
						{TIME_RANGE_OPTIONS.map((option, index) => {
							const isLocked = !isLogin && option.value !== "1d";
							const optionItem = (
								<button
									type="button"
									disabled={isLocked}
									ref={setItemRef(index)}
									onClick={() => {
										if (period !== option.value) {
											enableIndicatorAnimation();
										}
										onPeriodChange(option.value);
									}}
									className={cn(
										"relative cursor-pointer appearance-none rounded-full border-0 bg-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-300",
										period === option.value
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground",
										isLocked && "cursor-not-allowed opacity-40 grayscale",
									)}
								>
									<span className="relative z-20">{option.label}</span>
								</button>
							);

							if (isLocked) {
								return (
									<Tooltip key={option.value}>
										<TooltipTrigger asChild>
											<span className="inline-flex">{optionItem}</span>
										</TooltipTrigger>
										<TooltipContent>
											{t("monitor.loginRequired", "Please login to view")}
										</TooltipContent>
									</Tooltip>
								);
							}

							return (
								<React.Fragment key={option.value}>{optionItem}</React.Fragment>
							);
						})}
					</div>
				</TooltipProvider>
				<div className="flex items-center space-x-2">
					<Switch
						id="Peak"
						checked={isPeakEnabled}
						onCheckedChange={setIsPeakEnabled}
					/>
					<Label className="text-xs" htmlFor="Peak">
						{t("monitor.peakCut")}
					</Label>
				</div>
			</div>
			<Card className="sakura-detail-network-card">
				<CardHeader className="flex flex-col items-stretch space-y-0 overflow-hidden rounded-t-lg p-0 sm:flex-row">
					<div className="flex flex-none flex-col justify-center gap-1 border-b px-6 py-4">
						<CardTitle className="flex flex-none items-center gap-0.5 text-md">
							{serverName}
						</CardTitle>
						<CardDescription className="text-xs">
							{chartDataKey.length} {t("monitor.monitorCount")}
						</CardDescription>
					</div>
					<div className="flex flex-wrap w-full">{chartButtons}</div>
				</CardHeader>
				<CardContent className="pr-2 pl-0 py-4 sm:pt-6 sm:pb-6 sm:pr-6 sm:pl-2">
					<div className="relative">
						{activeCharts.length > 0 && (
							<button
								type="button"
								className="absolute -top-2 right-1 z-10 text-xs px-2 py-1 bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-xs rounded-[5px] text-muted-foreground hover:text-foreground transition-colors"
								onClick={clearAllSelections}
							>
								{t("monitor.clearSelections", "Clear")} ({activeCharts.length})
							</button>
						)}
						<ServerTimelineProvider>
							<ServerTimelineChart
								config={chartConfig}
								timelineValues={processedData.map((item) => item.created_at)}
								className={cn(
									"aspect-auto h-62.5 w-full transition-opacity",
									showPeriodLoading && "opacity-60",
								)}
							>
								<ComposedChart
									accessibilityLayer={false}
									data={processedData}
									margin={{ left: 12, right: 12 }}
								>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="created_at"
										tickLine={true}
										tickSize={3}
										axisLine={false}
										tickMargin={8}
										minTickGap={80}
										ticks={xAxisTicks}
										tickFormatter={formatXAxisTick}
									/>
									<YAxis
										yAxisId="delay"
										tickLine={false}
										axisLine={false}
										tickMargin={15}
										minTickGap={20}
										tickFormatter={(value) => `${value}ms`}
									/>
									{selectedHasPacketLoss && (
										<YAxis
											yAxisId="packet-loss"
											orientation="right"
											tickLine={false}
											axisLine={false}
											tickMargin={15}
											minTickGap={20}
											tickFormatter={(value) => `${value}%`}
										/>
									)}
									<ServerTimelineTooltip
										isAnimationActive={false}
										content={
											<ChartTooltipContent
												indicator={"line"}
												labelKey="created_at"
												labelFormatter={(_, payload) => {
													return formatTime(payload[0].payload.created_at);
												}}
												formatter={(value, name) => {
													let formattedValue: string;
													let label: string;

													if (name === "packet_loss") {
														formattedValue = `${Number(value).toFixed(2)}%`;
														label = t("monitor.packetLoss", "Packet Loss");
													} else if (name === "avg_delay") {
														formattedValue = `${Number(value).toFixed(2)}ms`;
														label = t("monitor.avgDelay", "Avg Delay");
													} else {
														// For monitor names (in multi-chart view) - delay data
														formattedValue = `${Number(value).toFixed(2)}ms`;
														label = getChartLabel(name as string);
													}

													return (
														<div className="flex flex-1 items-center justify-between leading-none">
															<span className="text-muted-foreground">
																{label}
															</span>
															<span className="ml-2 font-medium text-foreground tabular-nums">
																{formattedValue}
															</span>
														</div>
													);
												}}
											/>
										}
									/>
									{activeCharts.length !== 1 && (
										<ChartLegend content={<ChartLegendContent />} />
									)}
									{chartElements}
								</ComposedChart>
							</ServerTimelineChart>
						</ServerTimelineProvider>
						{showPeriodLoading && (
							<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md backdrop-blur-[1px]">
								<div className="flex size-9 items-center justify-center">
									<div className="absolute inset-0 flex items-center justify-center">
										<div className="size-4 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70 animate-spin" />
									</div>
								</div>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
});
