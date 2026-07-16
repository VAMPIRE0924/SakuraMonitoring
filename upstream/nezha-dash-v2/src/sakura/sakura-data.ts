import {
	formatNezhaInfo,
	getDaysBetweenDatesWithAutoRenewal,
	type PublicNoteData,
	parsePublicNote,
} from "@/lib/utils";
import type {
	CycleTransferData,
	CycleTransferStats,
	NezhaServer,
} from "@/types/nezha-api";

type SakuraPlanTagTone = "bandwidth" | "traffic" | "ip" | "route";

interface SakuraPlanTag {
	label: string;
	tone: SakuraPlanTagTone;
}

interface SakuraBillingSummary {
	amountLabel?: string;
	amountTone?: "price" | "free" | "usage";
	daysLabel?: string;
	expired?: boolean;
	isNeverExpire?: boolean;
	remainingPercent?: number;
}

export interface SakuraCycleTransfer {
	infinite: boolean;
	name: string;
	percent: number;
	serverId: string;
	total: number;
	used: number;
}

export interface SakuraServerView {
	billing?: SakuraBillingSummary;
	cycle?: SakuraCycleTransfer;
	info: ReturnType<typeof formatNezhaInfo>;
	planTags: SakuraPlanTag[];
	server: NezhaServer;
	uptimeLabel: string;
}

export interface SakuraOverviewTotals {
	downSpeed: number;
	downTransfer: number;
	offline: number;
	online: number;
	total: number;
	upSpeed: number;
	upTransfer: number;
}

export interface SakuraRateSample {
	down: number;
	t: number;
	up: number;
}

const SAKURA_RATE_HISTORY_WINDOW_MS = 30 * 60 * 1000;
const SAKURA_RATE_HISTORY_SAMPLE_MS = 2000;
const SAKURA_RATE_HISTORY_MAX_POINTS =
	Math.ceil(SAKURA_RATE_HISTORY_WINDOW_MS / SAKURA_RATE_HISTORY_SAMPLE_MS) + 2;
export const INFINITE_LIMIT_LABEL = "\u221e";

export function clampPercent(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

function formatCompactUptime(seconds: number) {
	const totalSeconds = Math.max(0, Math.floor(seconds || 0));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);

	if (days > 0) return `${days} d ${hours} h`;
	if (hours > 0) return `${hours} h ${minutes} min`;
	return `${minutes} min`;
}

function normalizePlatformLabel(value: string) {
	const text = value.replace(/\s+/g, " ").trim();
	if (!text) return "";

	const aliases: Array<[RegExp, string]> = [
		[/\b(?:rocky|rocky\s+linux|rocky-linux|blue\s+onyx)\b/i, "Rocky Linux"],
		[/\b(?:alma\s*linux|almalinux|alma-linux)\b/i, "AlmaLinux"],
		[/\b(?:oracle\s*linux|oracle-linux|ol)\b/i, "Oracle Linux"],
		[/\b(?:red\s*hat|redhat|rhel)\b/i, "RedHat"],
		[/\b(?:amazon|amazon\s*linux|amazon-linux)\b/i, "Amazon Linux"],
		[/\b(?:opensuse|open\s*suse|suse)\b/i, "openSUSE"],
		[/\b(?:kwrt|koolshare\s*openwrt)\b/i, "Kwrt"],
		[/\b(?:immortalwrt|immortal\s*wrt)\b/i, "ImmortalWrt"],
		[/\b(?:istoreos|istore\s*os)\b/i, "iStoreOS"],
		[/\b(?:openwrt|open\s*wrt)\b/i, "OpenWrt"],
		[/\bfreebsd\b/i, "FreeBSD"],
		[/\bwindows\b/i, "Windows"],
		[/\b(?:darwin|macos|mac\s*os)\b/i, "macOS"],
		[/\bcentos\b/i, "CentOS"],
		[/\bdebian\b/i, "Debian"],
		[/\bubuntu\b/i, "Ubuntu"],
		[/\balpine\b/i, "Alpine"],
		[/\bfedora\b/i, "Fedora"],
		[/\b(?:arch|archlinux|arch\s*linux)\b/i, "Arch Linux"],
		[/\blinux\b/i, "Linux"],
	];

	return aliases.find(([pattern]) => pattern.test(text))?.[1] || text;
}

function isGenericPlatform(value: string) {
	return /^(linux|unix|posix)$/i.test(value);
}

function isVersionOnlyPlatform(value: string) {
	const text = value.trim();
	if (!text) return true;
	return (
		/^\d/.test(text) ||
		/^[vV]?\d[\d._-]*(?:\s+[A-Za-z][\w.-]*){0,3}$/i.test(text) ||
		/^(blue\s+onyx|bookworm|bullseye|buster|jammy|focal|noble|trixie)$/i.test(
			text,
		)
	);
}

export function pickDisplayPlatform(...sources: string[]) {
	const values = sources
		.map(normalizePlatformLabel)
		.filter((value) => value && !/^N\/?A$/i.test(value))
		.filter((value) => !isVersionOnlyPlatform(value));

	return values.find((value) => !isGenericPlatform(value)) || values[0] || "";
}

function toFiniteNumber(value: unknown) {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

function isInfiniteLimit(value: unknown) {
	const text = String(value ?? "").trim();
	if (!text) return false;
	if (
		text === "-1" ||
		text === INFINITE_LIMIT_LABEL ||
		/^(infinity|inf|unlimited)$/i.test(text)
	) {
		return true;
	}
	const number = Number(value);
	return (
		Number.isFinite(number) &&
		(number < 0 || number >= 18_446_744_073_709_500_000)
	);
}

function createCycleSummary(
	cycle: CycleTransferData,
	serverId: string,
): SakuraCycleTransfer | null {
	const used = toFiniteNumber(cycle.transfer?.[serverId]);
	const rawMax = cycle.max;

	const infinite = isInfiniteLimit(rawMax);
	const total = infinite ? Number.POSITIVE_INFINITY : toFiniteNumber(rawMax);
	if (!infinite && total <= 0) return null;

	const percent = infinite ? 100 : clampPercent((used / total) * 100);

	return {
		infinite,
		name: cycle.name || cycle.server_name?.[serverId] || `#${serverId}`,
		percent,
		serverId,
		total,
		used,
	};
}

export function buildCycleTransfers(
	stats?: CycleTransferStats,
): Record<string, SakuraCycleTransfer> {
	const byServer: Record<string, SakuraCycleTransfer> = {};
	if (!stats) return byServer;

	for (const cycle of Object.values(stats)) {
		for (const serverId of Object.keys(cycle.transfer || {})) {
			if (byServer[serverId]) continue;
			const next = createCycleSummary(cycle, serverId);
			if (!next) continue;
			byServer[serverId] = next;
		}
	}

	return byServer;
}

function getPlanTags(publicNote: PublicNoteData | null) {
	const plan = publicNote?.planDataMod;
	if (!plan) return [];

	const tags: SakuraPlanTag[] = [];
	if (plan.bandwidth) tags.push({ label: plan.bandwidth, tone: "bandwidth" });
	if (plan.trafficVol) tags.push({ label: plan.trafficVol, tone: "traffic" });
	if (plan.IPv4 === "1") tags.push({ label: "IPv4", tone: "ip" });
	if (plan.IPv6 === "1") tags.push({ label: "IPv6", tone: "ip" });
	for (const route of plan.networkRoute.split(",").map((item) => item.trim())) {
		if (route) tags.push({ label: route, tone: "route" });
	}
	return tags;
}

function getBillingSummary(
	publicNote: PublicNoteData | null,
	translate: (key: string) => string,
): SakuraBillingSummary | undefined {
	const billing = publicNote?.billingDataMod;
	if (!billing) return undefined;

	const summary: SakuraBillingSummary = {};
	if (billing.amount && billing.amount !== "0" && billing.amount !== "-1") {
		summary.amountLabel = `${translate("billingInfo.price")}: ${billing.amount}/${billing.cycle}`;
		summary.amountTone = "price";
	} else if (billing.amount === "0") {
		summary.amountLabel = translate("billingInfo.free");
		summary.amountTone = "free";
	} else if (billing.amount === "-1") {
		summary.amountLabel = translate("billingInfo.usage-baseed");
		summary.amountTone = "usage";
	}

	if (!billing.startDate && !billing.endDate) return summary;
	if (billing.endDate?.startsWith("0000-00-00")) {
		summary.daysLabel = `${translate("billingInfo.remaining")}: ${translate("billingInfo.indefinite")}`;
		summary.isNeverExpire = true;
		return summary;
	}

	try {
		const days = getDaysBetweenDatesWithAutoRenewal(billing);
		summary.expired = days.days < 0;
		summary.remainingPercent = clampPercent(days.remainingPercentage * 100);
		summary.daysLabel =
			days.days >= 0
				? `${translate("billingInfo.remaining")}: ${days.days} ${translate("billingInfo.days")}`
				: `${translate("billingInfo.expired")}: ${Math.abs(days.days)} ${translate("billingInfo.days")}`;
	} catch {
		summary.daysLabel = `${translate("billingInfo.remaining")}: ${translate("billingInfo.error")}`;
	}

	return summary;
}

export function buildServerViews({
	cycles,
	now,
	servers,
	translate,
}: {
	cycles: Record<string, SakuraCycleTransfer>;
	now: number;
	servers: NezhaServer[];
	translate: (key: string) => string;
}): SakuraServerView[] {
	return servers.map((server) => {
		const info = formatNezhaInfo(now, server);
		const publicNote = parsePublicNote(info.public_note);

		return {
			billing: getBillingSummary(publicNote, translate),
			cycle: cycles[String(server.id)],
			info,
			planTags: getPlanTags(publicNote),
			server,
			uptimeLabel: formatCompactUptime(info.uptime),
		};
	});
}

export function getOverviewTotals(
	servers: SakuraServerView[],
): SakuraOverviewTotals {
	return servers.reduce<SakuraOverviewTotals>(
		(total, view) => {
			total.total += 1;
			if (!view.info.online) {
				total.offline += 1;
				return total;
			}

			total.online += 1;
			total.upTransfer += view.server.state?.net_out_transfer || 0;
			total.downTransfer += view.server.state?.net_in_transfer || 0;
			total.upSpeed += view.server.state?.net_out_speed || 0;
			total.downSpeed += view.server.state?.net_in_speed || 0;
			return total;
		},
		{
			downSpeed: 0,
			downTransfer: 0,
			offline: 0,
			online: 0,
			total: 0,
			upSpeed: 0,
			upTransfer: 0,
		},
	);
}

export function appendRateSample(
	history: SakuraRateSample[],
	sample: SakuraRateSample,
	windowMs = SAKURA_RATE_HISTORY_WINDOW_MS,
	sampleMs = SAKURA_RATE_HISTORY_SAMPLE_MS,
	maxSamples = SAKURA_RATE_HISTORY_MAX_POINTS,
) {
	const point = {
		down: Math.max(0, sample.down),
		t: sample.t,
		up: Math.max(0, sample.up),
	};
	const cutoff = point.t - windowMs;
	const nextHistory = history.filter(
		(item) => item.t >= cutoff && item.t <= point.t,
	);
	const previous = nextHistory[nextHistory.length - 1];

	if (!previous || point.t - previous.t >= sampleMs) {
		nextHistory.push(point);
	} else {
		nextHistory[nextHistory.length - 1] = point;
	}

	return nextHistory.slice(-maxSamples);
}
