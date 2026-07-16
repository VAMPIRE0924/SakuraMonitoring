import type { ServiceData } from "@/types/nezha-api";

const SERVICE_DAY_COUNT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeServiceSeries(value: number[]) {
	return value.map((item) => Math.max(0, item)).slice(-SERVICE_DAY_COUNT);
}

function rightAlignedValue(
	series: number[],
	totalLength: number,
	index: number,
) {
	const seriesIndex = index - (totalLength - series.length);
	return seriesIndex >= 0 ? series[seriesIndex] : undefined;
}

interface ServiceSummaryDay {
	completed: boolean;
	date: Date;
	delay: number;
	missing?: boolean;
	uptime: number;
}

interface ServiceSummary {
	avgDelay: number;
	days: ServiceSummaryDay[];
	id: string;
	name: string;
	uptime: number;
}

export function buildServiceSummaries(
	services?: Record<string, ServiceData>,
	now = Date.now(),
): ServiceSummary[] {
	if (!services) return [];

	return Object.entries(services).map(([serviceId, service]) => {
		const upSeries = normalizeServiceSeries(service.up);
		const downSeries = normalizeServiceSeries(service.down);
		const delaySeries = normalizeServiceSeries(service.delay);
		const totalUp = upSeries.reduce((total, value) => total + value, 0);
		const totalDown = downSeries.reduce((total, value) => total + value, 0);
		const totalChecks = totalUp + totalDown;
		const uptime = totalChecks > 0 ? (totalUp / totalChecks) * 100 : 0;
		const avgDelay =
			delaySeries.length > 0
				? delaySeries.reduce((total, value) => total + value, 0) /
					delaySeries.length
				: 0;
		const observedDayCount = Math.max(
			upSeries.length,
			downSeries.length,
			delaySeries.length,
		);
		const observedDays = Array.from(
			{ length: observedDayCount },
			(_, index) => {
				const upSample = rightAlignedValue(upSeries, observedDayCount, index);
				const downSample = rightAlignedValue(
					downSeries,
					observedDayCount,
					index,
				);
				const up = upSample ?? 0;
				const down = downSample ?? 0;
				const checks = up + down;
				return {
					completed: up > down,
					date: new Date(now - (observedDayCount - 1 - index) * DAY_MS),
					delay: rightAlignedValue(delaySeries, observedDayCount, index) ?? 0,
					...(upSample === undefined && downSample === undefined
						? { missing: true as const }
						: {}),
					uptime: checks > 0 ? (up / checks) * 100 : 0,
				};
			},
		);
		const paddingCount = Math.max(0, SERVICE_DAY_COUNT - observedDays.length);
		const missingDays = Array.from({ length: paddingCount }, (_, index) => ({
			completed: false,
			date: new Date(now - (SERVICE_DAY_COUNT - 1 - index) * DAY_MS),
			delay: 0,
			missing: true as const,
			uptime: 0,
		}));

		return {
			avgDelay,
			days: [...missingDays, ...observedDays].slice(-SERVICE_DAY_COUNT),
			id: serviceId,
			name: service.service_name || serviceId,
			uptime,
		};
	});
}
