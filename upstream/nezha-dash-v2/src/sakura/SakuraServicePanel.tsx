import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ServiceTrackerClient } from "@/components/ServiceTrackerClient";
import { buildServiceSummaries } from "@/lib/service-summary";
import { getServiceNameForPanel } from "@/lib/service-visibility";
import type { ServiceResponse } from "@/types/nezha-api";

export default function SakuraServicePanel({
	serviceData,
}: {
	serviceData: ServiceResponse | undefined;
}) {
	const { t } = useTranslation();
	const serviceRecords = serviceData?.data?.services;
	const services = useMemo(
		() =>
			buildServiceSummaries(serviceRecords)
				.map((service) => {
					const name = getServiceNameForPanel(service.name, "service");
					return name === null
						? null
						: { ...service, name: name || service.id };
				})
				.filter((service) => service !== null),
		[serviceRecords],
	);

	if (services.length === 0) return null;

	return (
		<section
			className="sakura-service-panel"
			aria-label={t("serviceTracker.uptime")}
		>
			<div className="sakura-service-grid">
				{services.map(({ avgDelay, days, id, name, uptime }) => (
					<ServiceTrackerClient
						key={id}
						avgDelay={avgDelay}
						className="sakura-service-card"
						days={days}
						title={name}
						uptime={uptime}
						variant="sakura"
					/>
				))}
			</div>
		</section>
	);
}
