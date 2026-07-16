import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SortOrder, SortType } from "@/context/sort-context";
import type { Status } from "@/context/status-context";
import { useSort } from "@/hooks/use-sort";
import { formatBytes, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	appendRateSample,
	type SakuraOverviewTotals,
	type SakuraRateSample,
} from "@/sakura/sakura-data";

type SakuraRatePath = {
	area: string;
	line: string;
};

function buildRatePath(
	history: SakuraRateSample[],
	key: "up" | "down",
	max: number,
): SakuraRatePath {
	const points = history.length ? history : [{ down: 0, t: 0, up: 0 }];
	const step = 260 / Math.max(points.length - 1, 1);
	const coords = points.map((point, index) => {
		const x = points.length === 1 ? 0 : index * step;
		const ratio = Math.max(0, Math.min(1, point[key] / max));
		const y = 64 - ratio * 46;
		return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
	});

	while (coords.length < 2) coords.push([260, coords[0][1]]);

	const line = coords.reduce((path, [x, y], index) => {
		if (index === 0) return `M${x} ${y}`;
		const [previousX, previousY] = coords[index - 1];
		const controlX = Number(((previousX + x) / 2).toFixed(2));
		return `${path} C${controlX} ${previousY}, ${controlX} ${y}, ${x} ${y}`;
	}, "");

	return {
		area: `${line} L260 72 L0 72 Z`,
		line,
	};
}

function buildRateChartPaths(
	history: SakuraRateSample[],
	upRate: number,
	downRate: number,
) {
	const values = history
		.flatMap((point) => [point.up, point.down])
		.filter((value) => value > 0)
		.sort((left, right) => left - right);
	const percentile = values.length
		? values[Math.floor((values.length - 1) * 0.95)]
		: 0;
	const sharedMax = Math.max(percentile, upRate, downRate, 1);

	return {
		down: buildRatePath(history, "down", sharedMax),
		up: buildRatePath(history, "up", sharedMax),
	};
}

function SakuraMetricCard({
	active,
	highlighted = false,
	label,
	onClick,
	value,
}: {
	active?: boolean;
	highlighted?: boolean;
	label: string;
	onClick: () => void;
	value: string | number;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			className={cn("nz-overview-basic-card", {
				"sakura-metric-card-highlighted": highlighted,
			})}
			onClick={onClick}
		>
			<span className="nz-overview-basic-copy">
				<small>{label}</small>
				<strong>{value}</strong>
			</span>
		</button>
	);
}

function SakuraTrafficOverviewCard({
	direction,
	illustration,
	onSort,
	rate,
	ratePath,
	sortType,
	traffic,
}: {
	direction: "up" | "down";
	illustration?: string;
	onSort: (type: SortType) => void;
	rate: number;
	ratePath: SakuraRatePath;
	sortType: SortType;
	traffic: number;
}) {
	const { t } = useTranslation();
	const isUp = direction === "up";
	const rateSort: SortType = isUp ? "up" : "down";
	const trafficSort: SortType = isUp ? "up total" : "down total";

	return (
		<div
			className={cn("sakura-metric-card sakura-traffic-card", {
				"nz-overview-traffic-card nz-overview-up-card": isUp,
				"nz-overview-rate-card nz-overview-down-card": !isUp,
			})}
		>
			<div
				className={cn(
					"nz-overview-direction-inner",
					isUp ? "nz-overview-up-inner" : "nz-overview-down-inner",
				)}
			>
				<div className="nz-overview-direction-head">
					<p>
						{isUp
							? t("serverOverview.totalUploadCard")
							: t("serverOverview.totalDownloadCard")}
					</p>
				</div>
				<div className="nz-overview-direction-metrics">
					<button
						type="button"
						className={cn(
							"nz-overview-direction-metric nz-overview-sort-metric",
							{ active: sortType === rateSort },
						)}
						aria-pressed={sortType === rateSort}
						onClick={() => onSort(rateSort)}
					>
						<span>{t("serverOverview.trafficRate")}</span>
						<b>{formatRate(rate)}</b>
					</button>
					<button
						type="button"
						className={cn(
							"nz-overview-direction-metric nz-overview-sort-metric",
							{ active: sortType === trafficSort },
						)}
						aria-pressed={sortType === trafficSort}
						onClick={() => onSort(trafficSort)}
					>
						<span>{t("serverOverview.trafficTotal")}</span>
						<b>{formatBytes(traffic)}</b>
					</button>
				</div>
				<div className="nz-overview-chart-card">
					<svg
						className="nz-overview-rate-chart nz-overview-direction-chart"
						viewBox="0 0 260 72"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<path
							className={cn(
								"nz-overview-rate-area",
								isUp
									? "nz-overview-rate-area-up"
									: "nz-overview-rate-area-down",
							)}
							d={ratePath.area}
						/>
						<path
							className={cn(
								"nz-overview-rate-line",
								isUp
									? "nz-overview-rate-line-up"
									: "nz-overview-rate-line-down",
							)}
							d={ratePath.line}
						/>
					</svg>
				</div>
			</div>
			{illustration && (
				<img
					className="nz-overview-illustration"
					src={illustration}
					alt=""
					loading="eager"
				/>
			)}
		</div>
	);
}

export default function SakuraOverview({
	illustration,
	onStatusChange,
	sampleKey,
	status,
	totals,
}: {
	illustration: string;
	onStatusChange: (status: Status) => void;
	sampleKey: number;
	status: Status;
	totals: SakuraOverviewTotals;
}) {
	const { t } = useTranslation();
	const { sortType, setSortOrder, setSortType } = useSort();
	const [history, setHistory] = useState<SakuraRateSample[]>([]);

	useEffect(() => {
		setHistory((current) =>
			appendRateSample(current, {
				down: totals.downSpeed,
				t: sampleKey,
				up: totals.upSpeed,
			}),
		);
	}, [sampleKey, totals.downSpeed, totals.upSpeed]);

	const ratePaths = useMemo(
		() => buildRateChartPaths(history, totals.upSpeed, totals.downSpeed),
		[history, totals.downSpeed, totals.upSpeed],
	);

	const applySort = (type: SortType, order: SortOrder = "desc") => {
		if (sortType === type) {
			setSortType("default");
			setSortOrder("desc");
			return;
		}

		setSortType(type);
		setSortOrder(order);
	};
	const applyStatus = (nextStatus: Status) => {
		if (nextStatus === "all") {
			onStatusChange("all");
			return;
		}

		onStatusChange(status === nextStatus ? "all" : nextStatus);
	};

	return (
		<section className="server-overview">
			<SakuraMetricCard
				label={t("serverOverview.totalServers")}
				value={totals.total}
				onClick={() => applyStatus("all")}
			/>
			<SakuraMetricCard
				active={status === "online"}
				highlighted={status === "online"}
				label={t("serverOverview.onlineServers")}
				value={totals.online}
				onClick={() => applyStatus("online")}
			/>
			<SakuraMetricCard
				active={status === "offline"}
				highlighted={status === "offline"}
				label={t("serverOverview.offlineServers")}
				value={totals.offline}
				onClick={() => applyStatus("offline")}
			/>
			<SakuraTrafficOverviewCard
				direction="up"
				ratePath={ratePaths.up}
				rate={totals.upSpeed}
				sortType={sortType}
				traffic={totals.upTransfer}
				onSort={applySort}
			/>
			<SakuraTrafficOverviewCard
				direction="down"
				illustration={illustration}
				ratePath={ratePaths.down}
				rate={totals.downSpeed}
				sortType={sortType}
				traffic={totals.downTransfer}
				onSort={applySort}
			/>
		</section>
	);
}
