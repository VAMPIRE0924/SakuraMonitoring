import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BackIcon } from "@/components/Icon";
import { ServerDetailLoading } from "@/components/loading/ServerDetailLoading";
import { ResolvedServerFlag } from "@/components/ServerFlag";
import { Badge } from "@/components/ui/badge";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import { getStoredItem, removeStoredItem } from "@/lib/browser-storage";
import { formatSakuraBytes } from "@/lib/sakura-format";
import { displaySakuraRegionName } from "@/lib/sakura-region";
import { cn, formatNezhaInfo, parsePublicNote } from "@/lib/utils";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./ui/accordion";

function DetailField({
	children,
	label,
}: {
	children: ReactNode;
	label: ReactNode;
}) {
	return (
		<div className="flex flex-col items-start gap-0.5 px-1.5 py-1">
			<p className="text-xs text-muted-foreground">{label}</p>
			{children}
		</div>
	);
}

export default function ServerDetailOverview({
	embedded = false,
	server_id,
}: {
	embedded?: boolean;
	server_id: string;
}) {
	const { i18n, t } = useTranslation();
	const navigate = useNavigate();
	const { forceUseSvgFlag } = useSakuraRuntimeConfig();

	const [hasHistory] = useState(
		() =>
			!embedded && getStoredItem("sessionStorage", "fromMainPage") === "true",
	);

	useEffect(() => {
		return () => {
			if (!embedded && hasHistory) {
				removeStoredItem("sessionStorage", "fromMainPage");
			}
		};
	}, [embedded, hasHistory]);

	const { lastData, connected } = useWebSocketContext();

	if (!connected && !lastData) {
		return <ServerDetailLoading embedded={embedded} />;
	}

	const handleBack = () => {
		if (hasHistory) {
			navigate(-1);
		} else {
			navigate("/");
		}
	};

	const nezhaWsData = lastData;

	if (!nezhaWsData) {
		return <ServerDetailLoading embedded={embedded} />;
	}

	const server = nezhaWsData.servers.find((s) => s.id === Number(server_id));

	if (!server) {
		return <ServerDetailLoading embedded={embedded} />;
	}

	const {
		name,
		online,
		uptime,
		arch,
		mem_total,
		disk_total,
		country_code,
		platform,
		platform_version,
		public_note,
		cpu_info,
		gpu_info,
		load_1,
		load_5,
		load_15,
		net_out_transfer,
		net_in_transfer,
		last_active_time_string,
		boot_time_string,
	} = formatNezhaInfo(nezhaWsData.now, server);
	const cityName =
		parsePublicNote(public_note)?.planDataMod?.extra.trim() ?? "";
	const regionName =
		cityName ||
		(country_code
			? displaySakuraRegionName(
					country_code,
					i18n.resolvedLanguage ?? i18n.language,
				)
			: "");

	return (
		<div className="sakura-detail-overview">
			{embedded ? (
				<div className="sakura-detail-dialog-title server-name">
					{country_code && (
						<ResolvedServerFlag
							className="sakura-detail-dialog-flag"
							country_code={country_code}
							forceUseSvgFlag={forceUseSvgFlag}
						/>
					)}
					<span>{name}</span>
				</div>
			) : (
				<button
					type="button"
					aria-label={t("Back")}
					onClick={handleBack}
					className="flex flex-none cursor-pointer bg-transparent p-0 text-left font-semibold leading-none items-center break-all tracking-tight gap-1 text-xl server-name"
				>
					<BackIcon />
					{name}
				</button>
			)}
			<section className="flex flex-wrap gap-2 mt-3">
				<DetailField label={t("serverDetail.status")}>
					<Badge
						className={cn(
							"text-[9px] rounded-[6px] w-fit px-1 py-0 -mt-[0.3px] dark:text-white",
							{
								" bg-green-800": online,
								" bg-red-600": !online,
							},
						)}
					>
						{online ? t("serverDetail.online") : t("serverDetail.offline")}
					</Badge>
				</DetailField>
				{online && (
					<DetailField label={t("serverDetail.uptime")}>
						<span className="text-xs">
							{uptime / 86400 >= 1
								? `${Math.floor(uptime / 86400)} ${t("serverDetail.days")} ${Math.floor((uptime % 86400) / 3600)} ${t("serverDetail.hours")}`
								: `${Math.floor(uptime / 3600)} ${t("serverDetail.hours")}`}
						</span>
					</DetailField>
				)}
				{arch && (
					<DetailField label={t("serverDetail.arch")}>
						<div className="text-xs">{arch}</div>
					</DetailField>
				)}

				{mem_total ? (
					<DetailField label={t("serverDetail.mem")}>
						<div className="text-xs">{formatSakuraBytes(mem_total)}</div>
					</DetailField>
				) : null}

				{disk_total ? (
					<DetailField label={t("serverDetail.disk")}>
						<div className="text-xs">{formatSakuraBytes(disk_total)}</div>
					</DetailField>
				) : null}
				{regionName && (
					<DetailField
						label={t(cityName ? "serverDetail.city" : "serverDetail.country")}
					>
						<div className="text-xs text-start">{regionName}</div>
					</DetailField>
				)}
			</section>
			<section className="flex flex-wrap gap-2 mt-1">
				{platform && (
					<DetailField label={t("serverDetail.system")}>
						<div className="text-xs">
							{platform} {platform_version ? ` - ${platform_version}` : ""}
						</div>
					</DetailField>
				)}
				{cpu_info.length > 0 && (
					<DetailField label="CPU">
						<div className="text-xs">{cpu_info.join(", ")}</div>
					</DetailField>
				)}
				{gpu_info.length > 0 && (
					<DetailField label="GPU">
						<div className="text-xs">{gpu_info.join(", ")}</div>
					</DetailField>
				)}
			</section>
			<section className="flex flex-wrap gap-2 mt-1">
				<DetailField label="Load">
					<div className="text-xs tabular-nums">
						{load_1} / {load_5} / {load_15}
					</div>
				</DetailField>
				<DetailField label={t("serverDetail.upload")}>
					<span className="text-xs">{formatSakuraBytes(net_out_transfer)}</span>
				</DetailField>
				<DetailField label={t("serverDetail.download")}>
					<span className="text-xs">{formatSakuraBytes(net_in_transfer)}</span>
				</DetailField>
			</section>
			<section className="flex flex-wrap gap-2 mt-1">
				{server.state.temperatures.length > 0 && (
					<section className="flex flex-wrap gap-2 ml-1.5">
						<Accordion type="single" collapsible className="w-fit">
							<AccordionItem value="item-1" className="border-none">
								<AccordionTrigger className="text-xs py-0 text-muted-foreground font-normal">
									{t("serverDetail.temperature")}
								</AccordionTrigger>
								<AccordionContent className="pb-0">
									<section className="flex items-start flex-wrap gap-2">
										{server.state.temperatures.map((item, index) => (
											<div
												className="text-xs flex items-center"
												key={`${item.Name}-${index}`}
											>
												<p className="font-semibold">{item.Name}</p>:{" "}
												{item.Temperature.toFixed(2)} °C
											</div>
										))}
									</section>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</section>
				)}
			</section>

			<section className="flex flex-wrap gap-2 mt-1">
				<DetailField label={t("serverDetail.bootTime")}>
					<div className="text-xs">{boot_time_string || "N/A"}</div>
				</DetailField>
				<DetailField label={t("serverDetail.lastActive")}>
					<span className="text-xs">{last_active_time_string || "N/A"}</span>
				</DetailField>
			</section>
		</div>
	);
}
