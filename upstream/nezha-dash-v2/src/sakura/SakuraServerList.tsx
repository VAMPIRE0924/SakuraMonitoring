import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ResolvedServerFlag } from "@/components/ServerFlag";
import { extractCpuCoreCount } from "@/lib/cpu-info";
import { formatBytes } from "@/lib/format";
import {
	GetFontLogoClass,
	GetOsName,
	MageMicrosoftWindows,
} from "@/lib/logo-class";
import { saveMainPageScrollPosition } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type {
	SakuraCycleTransfer,
	SakuraServerView,
} from "@/sakura/sakura-data";
import {
	clampPercent,
	INFINITE_LIMIT_LABEL,
	pickDisplayPlatform,
} from "@/sakura/sakura-data";

export type SakuraViewMode = "grid" | "list";

const LIST_TITLE_MIN_WIDTH = 142;
const LIST_TITLE_MAX_WIDTH = 220;
const LIST_TITLE_MEASURE_PAD = 42;
const CARD_MIN_WIDTH = 300;
const CARD_ROW_HEIGHT = 400;
const CARD_ROW_GAP = 16;
const LIST_ROW_HEIGHT = 90;
const LIST_ROW_GAP = 8;
const VIRTUAL_LIST_THRESHOLD = 80;

interface ServerListLayout {
	scrollMargin: number;
	width: number;
}

function readServerListLayout(element: HTMLElement): ServerListLayout {
	return {
		scrollMargin: element.getBoundingClientRect().top + window.scrollY,
		width: element.clientWidth,
	};
}

function sameServerListLayout(left: ServerListLayout, right: ServerListLayout) {
	return (
		Math.abs(left.scrollMargin - right.scrollMargin) < 1 &&
		Math.abs(left.width - right.width) < 1
	);
}

function getBusinessCompleteness(view: SakuraServerView) {
	const hasCycle = Boolean(view.cycle);
	const hasRemaining = Boolean(view.billing?.daysLabel);
	const hasPrice = Boolean(view.billing?.amountLabel);
	const hasTags = view.planTags.length > 0;
	return {
		hasCycle,
		hasPlaceholder: !hasCycle || !hasRemaining || !hasPrice || !hasTags,
	};
}

function clampListTitleWidth(width: number) {
	return Math.max(
		LIST_TITLE_MIN_WIDTH,
		Math.min(LIST_TITLE_MAX_WIDTH, Math.ceil(width)),
	);
}

function getListIdentityLines(view: SakuraServerView) {
	return {
		billingLine: view.billing?.amountLabel || "",
		detailLine: view.billing?.daysLabel || "",
	};
}

function getListTitleMeasurements(servers: SakuraServerView[]) {
	return servers.flatMap((view) => {
		const { billingLine, detailLine } = getListIdentityLines(view);
		return [
			{ font: "700 12px", text: view.info.name },
			{ font: "600 10px", text: billingLine },
			{ font: "600 10px", text: detailLine },
		];
	});
}

function measureListTitleWidth(
	measurements: ReturnType<typeof getListTitleMeasurements>,
) {
	const context = document.createElement("canvas").getContext("2d");
	if (!context || typeof context.measureText !== "function") {
		return LIST_TITLE_MIN_WIDTH;
	}

	const fontFamily = getComputedStyle(document.documentElement).fontFamily;
	const measuredWidth = measurements.reduce((width, measurement) => {
		context.font = `${measurement.font} ${fontFamily}`;
		return Math.max(width, context.measureText(measurement.text).width);
	}, 0);

	return clampListTitleWidth(measuredWidth + LIST_TITLE_MEASURE_PAD);
}

function getExpireBarStyle(percent: number): React.CSSProperties {
	const ratio = clampPercent(percent) / 100;
	const hue = 4 + 138 * ratio ** 0.92;
	return {
		"--nz-expire-fill": `hsl(${hue.toFixed(1)} 76% 50%)`,
		"--nz-expire-glow": `hsl(${hue.toFixed(1)} 76% 45% / 0.24)`,
	} as React.CSSProperties;
}

const CAPACITY_UNITS = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB"];

function formatCapacityPair(used: number, total: number, minUnit = 2) {
	if (!Number.isFinite(used)) return "N/A";

	const maxBytes = Math.max(0, used, Number.isFinite(total) ? total : 0);
	let unit = Math.max(0, Math.min(minUnit, CAPACITY_UNITS.length - 1));
	while (maxBytes / 1024 ** unit >= 1024 && unit < CAPACITY_UNITS.length - 1) {
		unit += 1;
	}

	if (!Number.isFinite(total) || total <= 0) {
		const value = Math.max(0, used) / 1024 ** unit;
		return `${value.toFixed(2)} ${CAPACITY_UNITS[unit]}`;
	}

	const scale = 1024 ** unit;
	const clean = (value: number) => {
		const number = Math.max(0, value) / scale;
		const digits = number >= 100 ? 0 : number >= 10 ? 1 : 2;
		return Number(number.toFixed(digits)).toString();
	};

	return `${clean(used)} / ${clean(total)} ${CAPACITY_UNITS[unit]}`;
}

function formatLegacyCardRate(bytesPerSecond: number) {
	const mib =
		Math.max(0, Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0) /
		1024 /
		1024;
	if (mib >= 1024) return `${(mib / 1024).toFixed(2)}G/s`;
	if (mib >= 1) return `${mib.toFixed(2)}M/s`;
	return `${(mib * 1024).toFixed(2)}K/s`;
}

function pickCoreUnit(language: string) {
	const normalized = language.toLowerCase();
	if (normalized.startsWith("zh")) return "\u6838\u5fc3";
	if (normalized.startsWith("ru")) return "\u044f\u0434\u0435\u0440";
	if (normalized.startsWith("es")) return "n\u00facleos";
	if (normalized.startsWith("de")) return "Kerne";
	return "cores";
}

function formatCpuCoreLabel(
	cpuInfo: string[] | null | undefined,
	language: string,
) {
	const cores = extractCpuCoreCount(cpuInfo);
	if (!cores) return "N/A";
	const unit = pickCoreUnit(language);
	return /[\u3400-\u9fff]/.test(unit) ? `${cores}${unit}` : `${cores} ${unit}`;
}

function getDisplayPlatformIconKey(platform: string) {
	const normalized = platform.toLowerCase();
	if (normalized.includes("rocky")) return "rocky-linux";
	if (normalized.includes("alma")) return "almalinux";
	if (normalized.includes("centos")) return "centos";
	if (normalized.includes("debian")) return "debian";
	if (normalized.includes("ubuntu")) return "ubuntu";
	if (normalized.includes("fedora")) return "fedora";
	if (normalized.includes("arch")) return "archlinux";
	if (normalized.includes("freebsd")) return "freebsd";
	if (normalized.includes("opensuse")) return "opensuse";
	if (normalized.includes("amazon")) return "amazon";
	if (normalized.includes("redhat") || normalized.includes("red hat")) {
		return "redhat";
	}
	if (normalized.includes("darwin") || normalized.includes("macos")) {
		return "darwin";
	}
	return normalized;
}

function SakuraPlatformIcon({ platform }: { platform: string }) {
	const normalized = platform.toLowerCase();
	if (normalized.includes("windows")) return <MageMicrosoftWindows />;

	return (
		<i
			className={`fl-${GetFontLogoClass(getDisplayPlatformIconKey(platform))}`}
		/>
	);
}

function SakuraGauge({
	label,
	unavailable = false,
	value,
	valueLabel,
}: {
	label: string;
	unavailable?: boolean;
	value: number;
	valueLabel?: string;
}) {
	const clampedValue = unavailable ? 0 : clampPercent(value);
	const hue = Math.max(0, Math.min(145, 145 - clampedValue * 1.45));
	const ringColor = `hsl(${hue.toFixed(2)} 72% 50%)`;

	return (
		<div className="sakura-gauge">
			<span>{label}</span>
			<div
				className="sakura-gauge-ring"
				role="progressbar"
				aria-label={label}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Number(clampedValue.toFixed(2))}
				aria-valuetext={unavailable ? "N/A" : undefined}
				data-sakura-unavailable={unavailable ? "true" : undefined}
				style={
					{
						"--value": clampedValue,
						"--nz-ring-color": ringColor,
						"--nz-ring-soft": `hsl(${hue.toFixed(2)} 72% 50% / 0.16)`,
						"--nz-ring-glow": `hsl(${hue.toFixed(2)} 72% 50% / 0.20)`,
					} as React.CSSProperties
				}
			>
				<strong>{unavailable ? "N/A" : `${clampedValue.toFixed(2)}%`}</strong>
			</div>
			{valueLabel && <small>{valueLabel}</small>}
		</div>
	);
}

function SakuraSpeedMetric({
	direction,
	label,
	unavailable = false,
	value,
}: {
	direction: "up" | "down";
	label: string;
	unavailable?: boolean;
	value: string;
}) {
	return (
		<div className="sakura-speed-metric" data-direction={direction}>
			<strong>
				<span className="sr-only">{label}</span>
				<span className="sakura-speed-arrow" aria-hidden="true">
					{direction === "up" ? "↑" : "↓"}
				</span>
				{unavailable ? "N/A" : value}
			</strong>
		</div>
	);
}

function SakuraListMetric({
	label,
	progress,
	value,
}: {
	label: string;
	progress?: number;
	value: string;
}) {
	return (
		<div className="sakura-list-metric">
			<small>{label}</small>
			<strong>{value}</strong>
			{typeof progress === "number" && (
				<span
					className="sakura-list-progress"
					data-sakura-usage-tone={
						progress > 90 ? "critical" : progress > 70 ? "warning" : "healthy"
					}
					aria-hidden="true"
				>
					<i style={{ width: `${clampPercent(progress).toFixed(2)}%` }} />
				</span>
			)}
		</div>
	);
}

function SakuraListSystem({
	label,
	platform,
}: {
	label: string;
	platform: string;
}) {
	return (
		<div className="sakura-list-system">
			<span className="sakura-list-system-icon">
				{platform && <SakuraPlatformIcon platform={platform} />}
			</span>
			<span className="sakura-list-system-copy">
				<small>{label}</small>
				<strong>{platform}</strong>
			</span>
		</div>
	);
}

function getCardSystemName(platform: string) {
	const normalized = platform.toLowerCase();
	if (normalized.includes("windows")) return "Windows";
	return GetOsName(normalized);
}

function formatOfficialListUptime(
	seconds: number,
	translate: (key: string) => string,
) {
	return seconds / 86400 >= 1
		? `${(seconds / 86400).toFixed(0)} ${translate("serverCard.days")}`
		: `${(seconds / 3600).toFixed(0)} ${translate("serverCard.hours")}`;
}

function SakuraBillingFields({ view }: { view: SakuraServerView }) {
	if (!view.billing?.amountLabel && !view.billing?.daysLabel) return null;

	return (
		<>
			{view.billing.amountLabel && (
				<span
					className="nz-footer-price"
					data-sakura-billing-tone={view.billing.amountTone}
				>
					{view.billing.amountLabel}
				</span>
			)}
			{view.billing.daysLabel && (
				<span
					className={cn("nz-footer-remaining", {
						danger: view.billing.expired,
					})}
				>
					{view.billing.daysLabel}
				</span>
			)}
			{typeof view.billing.remainingPercent === "number" &&
				!view.billing.isNeverExpire &&
				!view.billing.expired && (
					<div
						className="sakura-billing-bar"
						style={getExpireBarStyle(view.billing.remainingPercent)}
					>
						<i
							style={{ width: `${view.billing.remainingPercent.toFixed(2)}%` }}
						/>
					</div>
				)}
		</>
	);
}

function SakuraCardBusinessBlock({ view }: { view: SakuraServerView }) {
	if (!view.cycle && !view.billing?.amountLabel && !view.billing?.daysLabel) {
		return null;
	}
	return (
		<section className="nz-card-business sakura-card-business">
			<SakuraCycleBlock cycle={view.cycle} />
			<SakuraBillingFields view={view} />
		</section>
	);
}

function SakuraCycleBlock({ cycle }: { cycle?: SakuraCycleTransfer }) {
	if (!cycle) return null;

	return (
		<section
			className={cn("nz-cycle-transfer sakura-cycle-block", {
				"nz-cycle-transfer-infinite": cycle.infinite,
			})}
			title={cycle.name}
		>
			<header className="nz-cycle-transfer-head">
				<span className="nz-cycle-transfer-name sakura-card-cycle-name">
					<SakuraCycleLimitText cycle={cycle} />
				</span>
				<span className="nz-cycle-transfer-percent">
					{" "}
					{cycle.infinite
						? INFINITE_LIMIT_LABEL
						: `${cycle.percent.toFixed(1)}%`}
				</span>
			</header>
			<div className="sakura-cycle-bar">
				<i style={{ width: `${cycle.percent.toFixed(2)}%` }} />
			</div>
		</section>
	);
}

function SakuraCycleLimitText({ cycle }: { cycle: SakuraCycleTransfer }) {
	return (
		<>
			{formatBytes(cycle.used)} /{" "}
			{cycle.infinite ? (
				<span className="sakura-cycle-limit sakura-list-cycle-limit">
					{INFINITE_LIMIT_LABEL}
				</span>
			) : (
				formatBytes(cycle.total)
			)}
		</>
	);
}

function SakuraListCycleTransfer({ cycle }: { cycle?: SakuraCycleTransfer }) {
	if (!cycle) return null;

	return (
		<section
			className={cn("nz-list-cycle-transfer sakura-list-cycle-transfer", {
				"nz-list-cycle-infinite": cycle.infinite,
			})}
			title={cycle.name}
		>
			<header className="sakura-list-cycle-head">
				<span className="sakura-list-cycle-name">
					<SakuraCycleLimitText cycle={cycle} />
				</span>
				<span className="sakura-list-cycle-percent">
					{" "}
					{cycle.infinite
						? INFINITE_LIMIT_LABEL
						: `${cycle.percent.toFixed(1)}%`}
				</span>
			</header>
			<div className="sakura-list-cycle-bar">
				<i style={{ width: `${cycle.percent.toFixed(2)}%` }} />
			</div>
		</section>
	);
}

function SakuraTagList({ view }: { view: SakuraServerView }) {
	if (view.planTags.length === 0) return null;

	return (
		<section className="nz-card-tag-section sakura-plan-row">
			{view.planTags.map((tag, index) => (
				<span key={`${tag.label}-${index}`} data-tone={tag.tone}>
					{tag.label}
				</span>
			))}
		</section>
	);
}

function SakuraCardTitleBilling({ view }: { view: SakuraServerView }) {
	if (!view.billing?.amountLabel && !view.billing?.daysLabel) return null;

	return (
		<span className="sakura-title-billing">
			{view.billing.amountLabel && (
				<span data-sakura-billing-tone={view.billing.amountTone}>
					{view.billing.amountLabel}
				</span>
			)}
			{view.billing.daysLabel && (
				<span className={cn({ danger: view.billing.expired })}>
					{view.billing.daysLabel}
				</span>
			)}
		</span>
	);
}

function SakuraServerIdentity({
	fixedName,
	forceUseSvgFlag,
	view,
}: {
	fixedName: boolean;
	forceUseSvgFlag: boolean;
	view: SakuraServerView;
}) {
	const { t } = useTranslation();
	const displayPlatform = pickDisplayPlatform(
		view.info.platform,
		view.info.platform_version,
	);
	const statusLabel = view.info.online ? t("online") : t("offline");

	return (
		<header
			className={cn("nz-card-title sakura-server-head", {
				"sakura-server-head-fixed": fixedName,
			})}
		>
			<span className="sakura-card-flag-slot" aria-hidden="true">
				<ResolvedServerFlag
					country_code={view.info.country_code}
					forceUseSvgFlag={forceUseSvgFlag}
				/>
			</span>
			<div className="sakura-card-title-copy">
				<p className="sakura-card-title-name">{view.info.name}</p>
				{!fixedName && <SakuraCardTitleBilling view={view} />}
				<div className="nz-card-title-meta sakura-card-title-meta">
					{displayPlatform && (
						<span className="nz-card-title-system">
							<span className="nz-card-title-system-icon">
								<SakuraPlatformIcon platform={displayPlatform} />
							</span>
							<span className="nz-card-title-system-label">
								{displayPlatform}
							</span>
						</span>
					)}
					<span className="nz-card-title-uptime">
						{view.info.online ? view.uptimeLabel : ""}
					</span>
				</div>
			</div>
			<span className="sakura-card-status">{statusLabel}</span>
		</header>
	);
}

function SakuraServerListIdentity({
	forceUseSvgFlag,
	view,
}: {
	forceUseSvgFlag: boolean;
	view: SakuraServerView;
}) {
	const { billingLine, detailLine } = getListIdentityLines(view);

	return (
		<section className="sakura-list-identity">
			<span className={cn("sakura-status-dot", { online: view.info.online })} />
			<span className="sakura-list-flag">
				<ResolvedServerFlag
					country_code={view.info.country_code}
					forceUseSvgFlag={forceUseSvgFlag}
				/>
			</span>
			<div className="sakura-list-identity-copy">
				<strong>{view.info.name}</strong>
				{billingLine && (
					<span
						className="sakura-list-billing-line"
						data-sakura-billing-tone={view.billing?.amountTone}
					>
						{billingLine}
					</span>
				)}
				{detailLine && (
					<span
						className={cn("sakura-list-days-line", {
							danger: view.billing?.expired,
						})}
					>
						{detailLine}
					</span>
				)}
				{typeof view.billing?.remainingPercent === "number" &&
					!view.billing.isNeverExpire &&
					!view.billing.expired && (
						<div
							className="sakura-list-expire-bar"
							style={getExpireBarStyle(view.billing.remainingPercent)}
						>
							<i
								style={{
									width: `${view.billing.remainingPercent.toFixed(2)}%`,
								}}
							/>
						</div>
					)}
			</div>
		</section>
	);
}

function SakuraCardNetworkBlock({
	showNetTransfer,
	view,
}: {
	showNetTransfer: boolean;
	view: SakuraServerView;
}) {
	const { t } = useTranslation();
	const formatTransfer = (value: number) =>
		view.info.online ? formatBytes(value) : "N/A";
	const uploadValue = formatTransfer(view.info.net_out_transfer);
	const downloadValue = formatTransfer(view.info.net_in_transfer);

	return (
		<section className="nz-card-net-section sakura-card-network">
			<strong className="sakura-card-network-title">
				{t("serverOverview.trafficRate")}
			</strong>
			{showNetTransfer && (
				<>
					<div
						className="sakura-card-transfer-value"
						data-direction="up"
						title={`↑ ${uploadValue}`}
					>
						<span aria-hidden="true">↑</span> {uploadValue}
					</div>
					<div
						className="sakura-card-transfer-value"
						data-direction="down"
						title={`↓ ${downloadValue}`}
					>
						<span aria-hidden="true">↓</span> {downloadValue}
					</div>
				</>
			)}
			<strong className="sakura-card-traffic-title">
				{t("serverOverview.trafficTotal")}
			</strong>
		</section>
	);
}

function SakuraServerCardMode({
	fixedName,
	forceUseSvgFlag,
	showNetTransfer,
	view,
}: {
	fixedName: boolean;
	forceUseSvgFlag: boolean;
	showNetTransfer: boolean;
	view: SakuraServerView;
}) {
	const { i18n, t } = useTranslation();
	const business = getBusinessCompleteness(view);
	const cpuValue = formatCpuCoreLabel(view.server.host.cpu, i18n.language);
	const memoryValue = formatCapacityPair(
		view.server.state.mem_used,
		view.server.host.mem_total,
	);
	const diskValue = formatCapacityPair(
		view.server.state.disk_used,
		view.server.host.disk_total,
		3,
	);
	const displayCpuValue = view.info.online ? cpuValue : "N/A";
	const displayMemoryValue = view.info.online ? memoryValue : "N/A";
	const displayDiskValue = view.info.online ? diskValue : "N/A";
	return (
		<>
			<SakuraServerIdentity
				fixedName={fixedName}
				forceUseSvgFlag={forceUseSvgFlag}
				view={view}
			/>
			<section className="nz-card-perf-section sakura-server-metrics">
				<SakuraGauge
					label="CPU"
					unavailable={!view.info.online}
					value={view.info.cpu}
					valueLabel={displayCpuValue}
				/>
				<SakuraGauge
					label={t("serverCard.mem")}
					unavailable={!view.info.online}
					value={view.info.mem}
					valueLabel={displayMemoryValue}
				/>
				<SakuraGauge
					label={t("serverCard.stg")}
					unavailable={!view.info.online}
					value={view.info.stg}
					valueLabel={displayDiskValue}
				/>
				<SakuraSpeedMetric
					direction="up"
					label={t("serverCard.upload")}
					unavailable={!view.info.online}
					value={formatLegacyCardRate(view.server.state.net_out_speed)}
				/>
				<SakuraSpeedMetric
					direction="down"
					label={t("serverCard.download")}
					unavailable={!view.info.online}
					value={formatLegacyCardRate(view.server.state.net_in_speed)}
				/>
			</section>
			<SakuraCardNetworkBlock showNetTransfer={showNetTransfer} view={view} />
			<SakuraCardBusinessBlock view={view} />
			<SakuraTagList view={view} />
			{business.hasPlaceholder && (
				<div className="sakura-card-placeholder" aria-hidden="true">
					✧ · · · ✧
				</div>
			)}
		</>
	);
}

function SakuraServerListMode({
	forceUseSvgFlag,
	showNetTransfer,
	view,
}: {
	forceUseSvgFlag: boolean;
	showNetTransfer: boolean;
	view: SakuraServerView;
}) {
	const { t } = useTranslation();
	const rawDisplayPlatform = pickDisplayPlatform(
		view.info.platform,
		view.info.platform_version,
	);
	const displayPlatform = rawDisplayPlatform
		? getCardSystemName(rawDisplayPlatform)
		: "";
	const officialUptime = formatOfficialListUptime(view.info.uptime, t);
	const unavailableValue = view.info.online ? undefined : "N/A";

	return (
		<>
			<SakuraServerListIdentity forceUseSvgFlag={forceUseSvgFlag} view={view} />
			<span className="sakura-list-separator" aria-hidden="true" />
			<div className="sakura-list-body">
				<section className="sakura-list-metrics">
					<SakuraListSystem
						label={t("serverCard.system")}
						platform={displayPlatform}
					/>
					<SakuraListMetric
						label={t("serverCard.uptime")}
						value={view.info.online ? officialUptime : ""}
					/>
					<SakuraListMetric
						label="CPU"
						progress={view.info.online ? view.info.cpu : undefined}
						value={unavailableValue ?? `${view.info.cpu.toFixed(2)}%`}
					/>
					<SakuraListMetric
						label={t("serverCard.mem")}
						progress={view.info.online ? view.info.mem : undefined}
						value={unavailableValue ?? `${view.info.mem.toFixed(2)}%`}
					/>
					<SakuraListMetric
						label={t("serverCard.stg")}
						progress={view.info.online ? view.info.stg : undefined}
						value={unavailableValue ?? `${view.info.stg.toFixed(2)}%`}
					/>
					<SakuraListMetric
						label={t("serverCard.upload")}
						value={
							unavailableValue ??
							formatLegacyCardRate(view.server.state.net_out_speed)
						}
					/>
					<SakuraListMetric
						label={t("serverCard.download")}
						value={
							unavailableValue ??
							formatLegacyCardRate(view.server.state.net_in_speed)
						}
					/>
					{showNetTransfer && (
						<>
							<SakuraListMetric
								label={t("serverCard.totalUpload")}
								value={
									unavailableValue ?? formatBytes(view.info.net_out_transfer)
								}
							/>
							<SakuraListMetric
								label={t("serverCard.totalDownload")}
								value={
									unavailableValue ?? formatBytes(view.info.net_in_transfer)
								}
							/>
						</>
					)}
				</section>
				<SakuraListCycleTransfer cycle={view.cycle} />
				<SakuraTagList view={view} />
			</div>
		</>
	);
}

export function SakuraServerList({
	fixedName,
	forceUseSvgFlag,
	onOpenServer,
	servers,
	showNetTransfer,
	viewMode,
}: {
	fixedName: boolean;
	forceUseSvgFlag: boolean;
	onOpenServer?: (serverId: number) => void;
	servers: SakuraServerView[];
	showNetTransfer: boolean;
	viewMode: SakuraViewMode;
}) {
	const navigate = useNavigate();
	const listRef = useRef<HTMLElement>(null);
	const [listTitleWidth, setListTitleWidth] = useState(LIST_TITLE_MIN_WIDTH);
	const [layout, setLayout] = useState<ServerListLayout>({
		scrollMargin: 0,
		width: 0,
	});
	const measuredTitleKey = useRef("");
	const virtualized = servers.length >= VIRTUAL_LIST_THRESHOLD;
	const columnCount =
		viewMode === "grid"
			? Math.max(
					1,
					Math.floor(
						(layout.width + CARD_ROW_GAP) / (CARD_MIN_WIDTH + CARD_ROW_GAP),
					),
				)
			: 1;
	const virtualRowCount = Math.ceil(servers.length / columnCount);
	const virtualRowHeight =
		viewMode === "grid" ? CARD_ROW_HEIGHT : LIST_ROW_HEIGHT;
	const virtualRowGap = viewMode === "grid" ? CARD_ROW_GAP : LIST_ROW_GAP;
	const virtualizer = useWindowVirtualizer({
		count: virtualized ? virtualRowCount : 0,
		estimateSize: () => virtualRowHeight,
		gap: virtualRowGap,
		overscan: viewMode === "grid" ? 3 : 8,
		scrollMargin: layout.scrollMargin,
	});
	const updateLayout = useCallback(() => {
		const element = listRef.current;
		if (!element) return;
		const next = readServerListLayout(element);
		setLayout((current) =>
			sameServerListLayout(current, next) ? current : next,
		);
	}, []);

	useLayoutEffect(() => {
		updateLayout();
	});

	useLayoutEffect(() => {
		const element = listRef.current;
		if (!element) return;
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(updateLayout);
		observer?.observe(element);
		window.addEventListener("resize", updateLayout);

		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", updateLayout);
		};
	}, [updateLayout]);

	useLayoutEffect(() => {
		if (viewMode !== "list") return;
		let cancelled = false;
		const titleMeasurements = getListTitleMeasurements(servers);
		const titleMeasurementKey = JSON.stringify(titleMeasurements);
		if (measuredTitleKey.current === titleMeasurementKey) return;
		measuredTitleKey.current = titleMeasurementKey;

		const measure = () => {
			if (cancelled) return;
			if (measuredTitleKey.current !== titleMeasurementKey) return;
			setListTitleWidth(measureListTitleWidth(titleMeasurements));
		};

		measure();
		void document.fonts?.ready.then(measure);
		return () => {
			cancelled = true;
		};
	}, [servers, viewMode]);

	const openServer = (serverId: number) => {
		if (onOpenServer) {
			onOpenServer(serverId);
			return;
		}
		saveMainPageScrollPosition();
		navigate(`/server/${serverId}`);
	};

	const renderTile = (view: SakuraServerView) => (
		<SakuraServerTile
			fixedName={fixedName}
			key={view.server.id}
			onOpen={() => openServer(view.server.id)}
			forceUseSvgFlag={forceUseSvgFlag}
			showNetTransfer={showNetTransfer}
			view={view}
			viewMode={viewMode}
		/>
	);
	const virtualRows = virtualizer.getVirtualItems();

	return (
		<section
			ref={listRef}
			className={cn(
				viewMode === "list" ? "server-inline-list" : "server-card-list",
				"sakura-server-grid",
				{
					"sakura-server-list": viewMode === "list",
					"sakura-server-virtualized": virtualized,
				},
			)}
			style={
				virtualized
					? ({
							"--sakura-list-title-width": `${listTitleWidth}px`,
							height: virtualizer.getTotalSize(),
						} as React.CSSProperties)
					: viewMode === "list"
						? ({
								"--sakura-list-title-width": `${listTitleWidth}px`,
							} as React.CSSProperties)
						: undefined
			}
		>
			{virtualized ? (
				<div className="sakura-server-virtual-layer">
					{virtualRows.map((virtualRow) => {
						const start = virtualRow.index * columnCount;
						const row = servers.slice(start, start + columnCount);

						return (
							<div
								className={cn("sakura-server-virtual-row", {
									"card-row": viewMode === "grid",
									"list-row": viewMode === "list",
								})}
								data-index={virtualRow.index}
								key={virtualRow.key}
								ref={virtualizer.measureElement}
								style={{
									transform: `translateY(${virtualRow.start - layout.scrollMargin}px)`,
								}}
							>
								{row.map(renderTile)}
							</div>
						);
					})}
				</div>
			) : (
				servers.map(renderTile)
			)}
		</section>
	);
}

function SakuraServerTile({
	fixedName,
	forceUseSvgFlag,
	onOpen,
	showNetTransfer,
	view,
	viewMode,
}: {
	fixedName: boolean;
	forceUseSvgFlag: boolean;
	onOpen: () => void;
	showNetTransfer: boolean;
	view: SakuraServerView;
	viewMode: SakuraViewMode;
}) {
	return (
		<button
			type="button"
			className={cn(
				"sakura-server-tile",
				viewMode === "list" ? "nz-list-row" : "nz-card-row",
				{
					offline: !view.info.online,
					wide: viewMode === "list",
					"sakura-fixed-name": fixedName,
				},
			)}
			data-sakura-has-cycle-transfer={Boolean(view.cycle)}
			onClick={onOpen}
		>
			{viewMode === "list" ? (
				<SakuraServerListMode
					forceUseSvgFlag={forceUseSvgFlag}
					showNetTransfer={showNetTransfer}
					view={view}
				/>
			) : (
				<SakuraServerCardMode
					fixedName={fixedName}
					forceUseSvgFlag={forceUseSvgFlag}
					showNetTransfer={showNetTransfer}
					view={view}
				/>
			)}
		</button>
	);
}
