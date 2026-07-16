import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import { cn } from "@/lib/utils";

import { Separator } from "./ui/separator";

interface ServiceTrackerProps {
	days: Array<{
		completed: boolean;
		date?: Date;
		uptime: number;
		delay: number;
		missing?: boolean;
	}>;
	className?: string;
	title?: string;
	uptime?: number;
	avgDelay?: number;
	variant?: "default" | "sakura";
}

function getUptimeColor(uptime: number) {
	if (uptime >= 99) return "text-emerald-500";
	if (uptime >= 95) return "text-amber-500";
	return "text-rose-500";
}

function getDelayColor(delay: number) {
	if (delay < 100) return "text-emerald-500";
	if (delay < 300) return "text-amber-500";
	return "text-rose-500";
}

function getStatusColor(uptime: number) {
	if (uptime >= 99) return "bg-emerald-500";
	if (uptime >= 95) return "bg-amber-500";
	return "bg-rose-500";
}

export function ServiceTrackerClient({
	days,
	className,
	title,
	uptime = 100,
	avgDelay = 0,
	variant = "default",
}: ServiceTrackerProps) {
	const { t } = useTranslation();
	const { backgroundImage } = useSakuraRuntimeConfig();
	const isSakura = variant === "sakura";
	const daysRef = useRef<HTMLDivElement>(null);
	const touchSessionRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		moved: boolean;
	} | null>(null);
	const [touchDayIndex, setTouchDayIndex] = useState<number | null>(null);

	useEffect(() => {
		if (touchDayIndex === null) return;

		const closeTouchPreview = (event: PointerEvent) => {
			if (!daysRef.current?.contains(event.target as Node)) {
				setTouchDayIndex(null);
			}
		};
		document.addEventListener("pointerdown", closeTouchPreview);
		return () => document.removeEventListener("pointerdown", closeTouchPreview);
	}, [touchDayIndex]);

	const dayIndexAtPoint = (clientX: number, clientY: number) => {
		const target = document
			.elementFromPoint(clientX, clientY)
			?.closest<HTMLElement>("[data-service-day-index]");
		if (!target || !daysRef.current?.contains(target)) return null;

		const index = Number(target.dataset.serviceDayIndex);
		return Number.isSafeInteger(index) && index >= 0 && index < days.length
			? index
			: null;
	};

	const endTouchSession = (
		event: React.PointerEvent<HTMLDivElement>,
		cancelled = false,
	) => {
		const session = touchSessionRef.current;
		if (!session || session.pointerId !== event.pointerId) return;

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		if (cancelled || session.moved) setTouchDayIndex(null);
		touchSessionRef.current = null;
	};

	return (
		<div
			className={cn(
				!isSakura &&
					"w-full space-y-3 bg-white px-4 py-4 rounded-lg border bg-card text-card-foreground shadow-lg shadow-neutral-200/40 dark:shadow-none",
				className,
				!isSakura && {
					"bg-card/70": backgroundImage,
				},
			)}
		>
			<div className="service-tracker-head flex justify-between items-center">
				<div className="service-tracker-name flex items-center gap-2">
					<div
						className={cn(
							"service-tracker-status transition-colors",
							!isSakura && "w-2.5 h-2.5 rounded-full",
							getStatusColor(uptime),
						)}
					/>
					<span
						className={cn(
							"service-tracker-title font-medium",
							!isSakura && "text-sm",
						)}
					>
						{title}
					</span>
				</div>
				<div className="service-tracker-meta flex items-center gap-3">
					<span
						className={cn("service-tracker-metric", !isSakura && "contents")}
					>
						{isSakura && <small>{t("serviceTracker.averageDelay")}</small>}
						<span
							className={cn(
								"service-tracker-delay font-medium transition-colors",
								!isSakura && "text-sm",
								getDelayColor(avgDelay),
							)}
						>
							{avgDelay.toFixed(0)}ms
						</span>
					</span>
					<Separator
						className={cn(
							"service-tracker-separator",
							isSakura ? "!h-[18px]" : "h-4",
						)}
						orientation="vertical"
					/>
					<span
						className={cn("service-tracker-metric", !isSakura && "contents")}
					>
						{isSakura && <small>{t("serviceTracker.uptime")}</small>}
						<span
							className={cn(
								"service-tracker-uptime font-medium transition-colors",
								!isSakura && "text-sm",
								getUptimeColor(uptime),
							)}
						>
							{uptime.toFixed(1)}%
							{!isSakura && ` ${t("serviceTracker.uptime")}`}
						</span>
					</span>
				</div>
			</div>

			<div
				className={cn(
					"service-tracker-days flex",
					!isSakura && "gap-[3px] p-1 rounded-lg",
				)}
				ref={daysRef}
				onPointerDown={(event) => {
					if (event.pointerType !== "touch") return;
					const target = (event.target as HTMLElement).closest<HTMLElement>(
						"[data-service-day-index]",
					);
					if (!target || !event.currentTarget.contains(target)) return;

					const index = Number(target.dataset.serviceDayIndex);
					if (!Number.isSafeInteger(index) || index < 0 || index >= days.length)
						return;

					touchSessionRef.current = {
						pointerId: event.pointerId,
						startX: event.clientX,
						startY: event.clientY,
						moved: false,
					};
					event.currentTarget.setPointerCapture(event.pointerId);
					setTouchDayIndex(index);
				}}
				onPointerMove={(event) => {
					const session = touchSessionRef.current;
					if (!session || session.pointerId !== event.pointerId) return;

					if (
						Math.hypot(
							event.clientX - session.startX,
							event.clientY - session.startY,
						) > 4
					) {
						session.moved = true;
					}
					const index = dayIndexAtPoint(event.clientX, event.clientY);
					if (index !== null) setTouchDayIndex(index);
				}}
				onPointerUp={(event) => endTouchSession(event)}
				onPointerCancel={(event) => endTouchSession(event, true)}
			>
				<TooltipProvider delayDuration={50}>
					{days.map((day, index) => {
						const dateLabel = day.date?.toLocaleDateString() ?? "";
						const statusLabel = day.missing
							? t("serverDetail.unknown")
							: `${day.uptime.toFixed(1)}% ${t("serviceTracker.uptime")}, ${day.delay.toFixed(0)}ms ${t("serviceTracker.delay")}`;

						const touchOpenProps =
							touchDayIndex === null ? {} : { open: touchDayIndex === index };

						return (
							<Tooltip
								key={day.date?.toISOString() ?? index}
								{...touchOpenProps}
							>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label={`${dateLabel} ${statusLabel}`.trim()}
										data-service-day-index={index}
										data-touch-active={touchDayIndex === index || undefined}
										className={cn(
											"service-tracker-day relative flex-1 cursor-help border-0 p-0 transition-all duration-200",
											!isSakura && "h-7 rounded-[8px]",
											"before:absolute before:inset-0 before:rounded-[4px] before:opacity-0 hover:before:opacity-100 before:bg-white/10 before:transition-opacity",
											"after:absolute after:inset-0 after:rounded-[4px] after:shadow-[inset_0_1px_--theme(--color-white/10%)]",
											day.missing
												? "missing bg-zinc-400/20 shadow-none"
												: day.completed
													? "completed bg-linear-to-b from-green-500/90 to-green-600 shadow-[0_1px_2px_--theme(--color-green-600/30%)]"
													: "failed bg-linear-to-b from-red-500/80 to-red-600/90 shadow-[0_1px_2px_--theme(--color-red-600/30%)]",
										)}
									/>
								</TooltipTrigger>
								<TooltipContent
									className="p-0 overflow-hidden rounded-[10px]"
									data-service-day-tooltip={index}
								>
									<div className="px-3 py-2 bg-popover">
										<p className="font-medium text-sm mb-2">{dateLabel}</p>
										{day.missing ? (
											<p className="text-xs text-muted-foreground">
												{t("serverDetail.unknown")}
											</p>
										) : (
											<div className="space-y-1.5">
												<div className="flex items-center justify-between gap-3">
													<span className="text-xs text-muted-foreground">
														{t("serviceTracker.uptime")}:
													</span>
													<span
														className={cn(
															"text-xs font-medium",
															getUptimeColor(day.uptime),
														)}
													>
														{day.uptime.toFixed(1)}%
													</span>
												</div>
												<div className="flex items-center justify-between gap-3">
													<span className="text-xs text-muted-foreground">
														{t("serviceTracker.delay")}:
													</span>
													<span
														className={cn(
															"text-xs font-medium",
															getDelayColor(day.delay),
														)}
													>
														{day.delay.toFixed(0)}ms
													</span>
												</div>
											</div>
										)}
									</div>
								</TooltipContent>
							</Tooltip>
						);
					})}
				</TooltipProvider>
			</div>

			<div
				className={cn(
					"service-tracker-footer flex justify-between text-stone-500 dark:text-stone-400",
					!isSakura && "text-xs",
				)}
			>
				<span>30 {t("serviceTracker.daysAgo")}</span>
				<span>{t("serviceTracker.today")}</span>
			</div>
		</div>
	);
}
