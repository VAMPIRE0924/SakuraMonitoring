import {
	ChartBarSquareIcon,
	MapIcon,
	ViewColumnsIcon,
} from "@heroicons/react/20/solid";
import { useQuery } from "@tanstack/react-query";
import { ServerOff } from "lucide-react";
import {
	type CSSProperties,
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { SakuraPageLoader } from "@/components/loading/SakuraPageLoader";
import { SORT_TYPES, type SortType } from "@/context/sort-context";
import { useActiveIndicator } from "@/hooks/use-active-indicator";
import { useRestoreMainPageScroll } from "@/hooks/use-restore-main-page-scroll";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import { useSort } from "@/hooks/use-sort";
import { useStatus } from "@/hooks/use-status";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import {
	getStoredItem,
	removeStoredItem,
	setStoredItem,
} from "@/lib/browser-storage";
import { fetchServerGroup, fetchService } from "@/lib/nezha-api";
import { sortServerItems } from "@/lib/server-sort";
import { getServiceNameForPanel } from "@/lib/service-visibility";
import { cn } from "@/lib/utils";
import SakuraHeaderTimer from "@/sakura/SakuraHeaderTimer";
import SakuraOverview from "@/sakura/SakuraOverview";
import {
	SakuraServerList,
	type SakuraViewMode,
} from "@/sakura/SakuraServerList";
import {
	buildCycleTransfers,
	buildServerViews,
	getOverviewTotals,
} from "@/sakura/sakura-data";

const SakuraMapPanel = lazy(() => import("@/sakura/SakuraMapPanel"));
const SakuraServicePanel = lazy(() => import("@/sakura/SakuraServicePanel"));
const SakuraServerDetailDialog = lazy(
	() => import("@/sakura/SakuraServerDetailDialog"),
);

const SHOW_MAP_FALLBACK_KEYS = ["sakura-show-map"];
const SHOW_SERVICES_FALLBACK_KEYS = ["sakura-show-services"];
const ALL_GROUP_KEY = "all";

type SakuraGroupTab = {
	key: string;
	label: string;
};

function getGroupKey(group: { id?: number }, index: number) {
	return group.id ? `group:${group.id}` : `legacy-group:${index}`;
}

function useLocalToggle(
	key: string,
	forced: boolean,
	defaultValue = false,
	fallbackKeys: string[] = [],
): [boolean, (value: boolean) => void] {
	const [value, setValue] = useState(
		() => readStoredBoolean([key, ...fallbackKeys]) ?? defaultValue,
	);

	const updateValue = (nextValue: boolean) => {
		if (forced) return;

		setValue(nextValue);
		setStoredItem("localStorage", key, nextValue ? "1" : "0");
	};

	return [forced || value, updateValue];
}

function readStoredBoolean(keys: string[]): boolean | null {
	for (const key of keys) {
		const value = getStoredItem("localStorage", key);
		if (value === "1" || value === "true" || value === "list") return true;
		if (value === "0" || value === "false" || value === "grid") return false;
	}

	return null;
}

function readStoredViewMode(): SakuraViewMode {
	return readStoredBoolean(["inline", "sakura-view-mode"]) ? "list" : "grid";
}

function SakuraToolbar({
	currentGroup,
	groupTabs,
	hasServicePanel,
	showMap,
	showServices,
	viewMode,
	onGroupChange,
	onShowMapChange,
	onShowServicesChange,
	onViewModeChange,
}: {
	currentGroup: string;
	groupTabs: SakuraGroupTab[];
	hasServicePanel: boolean;
	showMap: boolean;
	showServices: boolean;
	viewMode: SakuraViewMode;
	onGroupChange: (group: string) => void;
	onShowMapChange: (show: boolean) => void;
	onShowServicesChange: (show: boolean) => void;
	onViewModeChange: (mode: SakuraViewMode) => void;
}) {
	const { t } = useTranslation();
	const { sortType, sortOrder, setSortOrder, setSortType } = useSort();
	const [sortMenuOpen, setSortMenuOpen] = useState(false);
	const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
	const sortRootRef = useRef<HTMLDivElement>(null);
	const groupScrollerRef = useRef<HTMLElement>(null);
	const groupScrollFrameRef = useRef<number | null>(null);
	const groupKeys = useMemo(
		() => groupTabs.map((group) => group.key),
		[groupTabs],
	);
	const indicatorGroup = hoveredGroup ?? currentGroup;
	const {
		containerRef: groupBarRef,
		enableIndicatorAnimation,
		indicator: groupIndicator,
		itemRefs: groupItemRefs,
		setItemRef: setGroupItemRef,
	} = useActiveIndicator(groupKeys, indicatorGroup);
	const sortKey = (type: SortType) => type.replace(/ /g, "_");
	const sortOptionLabel = (type: SortType) => t(`sort.types.${sortKey(type)}`);
	const sortActiveLabel = (type: SortType) => {
		const optionLabel = sortOptionLabel(type);
		if (type !== "up total" && type !== "down total") return optionLabel;
		return t(`sort.activeTypes.${sortKey(type)}`, {
			defaultValue: optionLabel,
		});
	};
	const sortLabel = (type: SortType) =>
		type === "default" ? t("sort.label") : sortActiveLabel(type);

	const getGroupItem = useCallback(
		(group: string) => groupItemRefs.current[groupKeys.indexOf(group)] ?? null,
		[groupItemRefs, groupKeys],
	);

	const scrollGroupItemIntoView = useCallback(
		(item: HTMLElement | null, center = false) => {
			const scroller = groupScrollerRef.current;
			if (!scroller || !item || !scroller.contains(item)) return;

			if (groupScrollFrameRef.current !== null) {
				window.cancelAnimationFrame(groupScrollFrameRef.current);
			}
			groupScrollFrameRef.current = window.requestAnimationFrame(() => {
				groupScrollFrameRef.current = null;
				if (!scroller.isConnected || !item.isConnected) return;

				const maxScroll = scroller.scrollWidth - scroller.clientWidth;
				if (maxScroll <= 1) return;

				const edgeSpace = 18;
				const scrollerRect = scroller.getBoundingClientRect();
				const itemRect = item.getBoundingClientRect();
				const itemLeft =
					itemRect.left - scrollerRect.left + scroller.scrollLeft;
				let nextLeft = scroller.scrollLeft;

				if (center) {
					nextLeft = itemLeft - (scroller.clientWidth - itemRect.width) / 2;
				} else if (itemRect.left < scrollerRect.left + edgeSpace) {
					nextLeft -= scrollerRect.left + edgeSpace - itemRect.left;
				} else if (itemRect.right > scrollerRect.right - edgeSpace) {
					nextLeft += itemRect.right - (scrollerRect.right - edgeSpace);
				}

				nextLeft = Math.max(0, Math.min(maxScroll, nextLeft));
				if (Math.abs(nextLeft - scroller.scrollLeft) < 1) return;
				scroller.scrollTo({ left: nextLeft, behavior: "smooth" });
			});
		},
		[],
	);

	useLayoutEffect(() => {
		scrollGroupItemIntoView(getGroupItem(currentGroup), true);
	}, [currentGroup, getGroupItem, scrollGroupItemIntoView]);

	useEffect(
		() => () => {
			if (groupScrollFrameRef.current !== null) {
				window.cancelAnimationFrame(groupScrollFrameRef.current);
			}
		},
		[],
	);

	useEffect(() => {
		if (!sortMenuOpen) return;

		const closeOnOutside = (event: PointerEvent) => {
			if (!sortRootRef.current?.contains(event.target as Node)) {
				setSortMenuOpen(false);
			}
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setSortMenuOpen(false);
			}
		};

		document.addEventListener("pointerdown", closeOnOutside);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [sortMenuOpen]);

	const chooseSortType = (nextType: SortType) => {
		setSortType(nextType);
		setSortMenuOpen(false);
		if (nextType === "default") setSortOrder("desc");
	};

	return (
		<section className="server-overview-controls sakura-toolbar">
			<div className="sakura-toolbar-primary">
				<div className="nz-toolbar-buttons sakura-tool-buttons">
					<button
						type="button"
						className={cn("nz-tool-button sakura-tool-button", {
							active: showMap,
						})}
						onClick={() => onShowMapChange(!showMap)}
						aria-label={t("controls.toggleMap")}
						aria-pressed={showMap}
					>
						<MapIcon className="size-[13px]" />
					</button>
					{hasServicePanel && (
						<button
							type="button"
							className={cn("nz-tool-button sakura-tool-button", {
								active: showServices,
							})}
							onClick={() => onShowServicesChange(!showServices)}
							aria-label={t("controls.toggleServices")}
							aria-pressed={showServices}
						>
							<ChartBarSquareIcon className="size-[13px]" />
						</button>
					)}
					<button
						type="button"
						className={cn("nz-tool-button sakura-tool-button", {
							active: viewMode === "list",
						})}
						onClick={() =>
							onViewModeChange(viewMode === "grid" ? "list" : "grid")
						}
						aria-label={t("controls.toggleServerView")}
						aria-pressed={viewMode === "list"}
					>
						<ViewColumnsIcon className="size-[13px]" />
					</button>
				</div>
				<section
					className="nz-group-toolbar sakura-groups"
					aria-label={t("controls.serverGroups")}
					ref={groupScrollerRef}
				>
					<div
						className="sakura-group-bar"
						ref={groupBarRef}
						data-sakura-group-ready={groupIndicator ? "true" : undefined}
						style={
							groupIndicator
								? ({
										"--nz-group-indicator-w": `${groupIndicator.width}px`,
										"--nz-group-indicator-h": `${groupIndicator.height}px`,
										"--nz-group-indicator-x": `${groupIndicator.x}px`,
										"--nz-group-indicator-y": `${groupIndicator.y}px`,
										"--nz-group-indicator-transition":
											groupIndicator.shouldAnimate
												? "transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), width 0.36s cubic-bezier(0.22, 1, 0.36, 1), height 0.36s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.22s ease"
												: "none",
									} as CSSProperties)
								: undefined
						}
						onPointerLeave={() => {
							enableIndicatorAnimation();
							setHoveredGroup(null);
						}}
						onBlur={(event) => {
							if (
								!event.currentTarget.contains(
									event.relatedTarget as Node | null,
								)
							) {
								enableIndicatorAnimation();
								setHoveredGroup(null);
							}
						}}
					>
						{groupTabs.map((group, index) => (
							<button
								type="button"
								key={group.key}
								ref={setGroupItemRef(index)}
								className={cn("nz-group-button sakura-group-button", {
									active: currentGroup === group.key,
								})}
								onClick={(event) => {
									enableIndicatorAnimation();
									onGroupChange(group.key);
									scrollGroupItemIntoView(event.currentTarget, true);
								}}
								onPointerEnter={(event) => {
									if (
										event.pointerType &&
										event.pointerType !== "mouse" &&
										event.pointerType !== "pen"
									)
										return;
									enableIndicatorAnimation();
									setHoveredGroup(group.key);
								}}
								onFocus={(event) => {
									enableIndicatorAnimation();
									setHoveredGroup(group.key);
									scrollGroupItemIntoView(event.currentTarget, true);
								}}
								aria-pressed={currentGroup === group.key}
							>
								{group.label}
							</button>
						))}
					</div>
				</section>
			</div>
			<div
				className="nz-sort-tool sakura-sort"
				ref={sortRootRef}
				data-open={sortMenuOpen}
			>
				<button
					type="button"
					className="nz-sort-order-button sakura-sort-order"
					disabled={sortType === "default"}
					onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
					aria-label={
						sortType === "default"
							? t("sort.directionDisabled")
							: sortOrder === "asc"
								? t("sort.ascending")
								: t("sort.descending")
					}
				>
					{sortType === "default" ? "↑↓" : sortOrder === "asc" ? "↑" : "↓"}
				</button>
				<button
					type="button"
					className="nz-sort-menu-button sakura-sort-menu-button"
					aria-expanded={sortMenuOpen}
					onClick={() => setSortMenuOpen((open) => !open)}
				>
					<span>{sortLabel(sortType)}</span>
				</button>
				{sortMenuOpen && (
					<div className="nz-sort-menu sakura-sort-menu" role="menu">
						{SORT_TYPES.map((type) => (
							<button
								type="button"
								key={type}
								className={cn("nz-sort-menu-item sakura-sort-menu-item", {
									active: sortType === type,
								})}
								onClick={() => chooseSortType(type)}
								role="menuitemradio"
								aria-checked={sortType === type}
							>
								<span>{sortOptionLabel(type)}</span>
							</button>
						))}
					</div>
				)}
			</div>
		</section>
	);
}

export default function SakuraDashboard() {
	const { t } = useTranslation();
	const config = useSakuraRuntimeConfig();
	const { sortType, sortOrder } = useSort();
	const { status, setStatus } = useStatus();
	const { connectionState, lastData } = useWebSocketContext();
	const [currentGroup, setCurrentGroup] = useState(() => {
		const storedGroup = getStoredItem("sessionStorage", "selectedGroup");
		return storedGroup && storedGroup !== "All" ? storedGroup : ALL_GROUP_KEY;
	});
	const [viewMode, setViewMode] = useState<SakuraViewMode>(readStoredViewMode);
	const effectiveViewMode = config.forceCardInline ? "list" : viewMode;
	const [showMap, setShowMap] = useLocalToggle(
		"showMap",
		config.forceShowMap,
		false,
		SHOW_MAP_FALLBACK_KEYS,
	);
	const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
	useEffect(() => {
		if (
			selectedServerId !== null &&
			lastData &&
			!lastData.servers.some((server) => server.id === selectedServerId)
		) {
			setSelectedServerId(null);
		}
	}, [lastData, selectedServerId]);
	const [showServices, setShowServices] = useLocalToggle(
		"showServices",
		config.forceShowServices,
		false,
		SHOW_SERVICES_FALLBACK_KEYS,
	);
	const { data: groupData } = useQuery({
		queryKey: ["server-group"],
		queryFn: ({ signal }) => fetchServerGroup(signal),
	});
	const { data: serviceData } = useQuery({
		queryKey: ["service"],
		queryFn: ({ signal }) => fetchService(signal),
		refetchInterval: 10000,
	});
	const hasServicePanel = Object.values(serviceData?.data?.services ?? {}).some(
		(service) =>
			getServiceNameForPanel(service.service_name, "service") !== null,
	);
	const cycles = useMemo(
		() => buildCycleTransfers(serviceData?.data?.cycle_transfer_stats),
		[serviceData?.data?.cycle_transfer_stats],
	);
	useRestoreMainPageScroll(Boolean(lastData));

	const groupServerIdSets = useMemo(() => {
		const sets = new Map<string, Set<number>>();
		for (const [index, item] of (groupData?.data || []).entries()) {
			if (Array.isArray(item.servers)) {
				sets.set(getGroupKey(item.group, index), new Set(item.servers));
			}
		}
		return sets;
	}, [groupData?.data]);

	const groupTabs = useMemo(
		() => [
			{ key: ALL_GROUP_KEY, label: "All" },
			...(groupData?.data?.map((item, index) => ({
				key: getGroupKey(item.group, index),
				label: item.group.name,
			})) || []),
		],
		[groupData?.data],
	);

	useEffect(() => {
		if (
			!groupData ||
			!lastData ||
			groupTabs.some((group) => group.key === currentGroup)
		)
			return;

		const legacyGroup = groupTabs.find((group) => group.label === currentGroup);
		if (legacyGroup) {
			setCurrentGroup(legacyGroup.key);
			setStoredItem("sessionStorage", "selectedGroup", legacyGroup.key);
			return;
		}

		setCurrentGroup(ALL_GROUP_KEY);
		removeStoredItem("sessionStorage", "selectedGroup");
	}, [currentGroup, groupData, groupTabs, lastData]);

	const allServerViews = useMemo(() => {
		if (!lastData) return [];
		return buildServerViews({
			cycles,
			now: lastData.now,
			servers: lastData.servers,
			translate: t,
		});
	}, [cycles, lastData, t]);
	const allGroupViews = useMemo(() => {
		if (currentGroup === ALL_GROUP_KEY) return allServerViews;
		const serverIds = groupServerIdSets.get(currentGroup);
		if (!serverIds) return [];
		return allServerViews.filter((view) => serverIds.has(view.server.id));
	}, [allServerViews, currentGroup, groupServerIdSets]);
	const totals = useMemo(
		() => getOverviewTotals(allGroupViews),
		[allGroupViews],
	);

	const statusFilteredServers =
		status === "all"
			? allGroupViews
			: allGroupViews.filter((view) =>
					status === "online" ? view.info.online : !view.info.online,
				);
	const filteredServers = sortServerItems(
		statusFilteredServers.map((view) => ({
			online: view.info.online,
			server: view.server,
			view,
		})),
		sortType,
		sortOrder,
	).map(({ view }) => view);
	const hasServers = allServerViews.length > 0;

	if (!lastData) {
		if (connectionState !== "disconnected") {
			return (
				<SakuraPageLoader label={t("info.loadingNodes")} targetProgress={92} />
			);
		}

		return (
			<section className="sakura-state">
				<ServerOff size={22} />
				<strong>{t("info.websocketDisconnected")}</strong>
			</section>
		);
	}

	const handleGroupChange = (group: string) => {
		setCurrentGroup(group);
		setStoredItem("sessionStorage", "selectedGroup", group);
	};

	const handleViewModeChange = (mode: SakuraViewMode) => {
		if (config.forceCardInline) return;

		setViewMode(mode);
		setStoredItem("localStorage", "inline", mode === "list" ? "1" : "0");
	};
	return (
		<div className="sakura-dashboard">
			<SakuraHeaderTimer />
			<SakuraOverview
				key={currentGroup}
				illustration={config.disableAnimatedMan ? "" : config.illustration}
				sampleKey={lastData.now}
				status={status}
				totals={totals}
				onStatusChange={setStatus}
			/>
			{hasServers && (
				<SakuraToolbar
					currentGroup={currentGroup}
					groupTabs={groupTabs}
					hasServicePanel={hasServicePanel}
					showMap={showMap}
					showServices={showServices}
					viewMode={effectiveViewMode}
					onGroupChange={handleGroupChange}
					onShowMapChange={setShowMap}
					onShowServicesChange={setShowServices}
					onViewModeChange={handleViewModeChange}
				/>
			)}
			{hasServers && showMap && (
				<Suspense fallback={null}>
					<SakuraMapPanel
						now={lastData.now}
						onOpenServer={setSelectedServerId}
						serverList={lastData.servers}
					/>
				</Suspense>
			)}
			{hasServers && showServices && (
				<Suspense fallback={null}>
					<SakuraServicePanel serviceData={serviceData} />
				</Suspense>
			)}
			{!hasServers || filteredServers.length === 0 ? (
				<section className="sakura-state" role="status">
					<ServerOff size={22} />
					<strong>
						{t(hasServers ? "info.noMatchingServers" : "info.noServers")}
					</strong>
				</section>
			) : (
				<SakuraServerList
					fixedName={config.fixedTopServerName}
					forceUseSvgFlag={config.forceUseSvgFlag}
					onOpenServer={setSelectedServerId}
					servers={filteredServers}
					showNetTransfer={config.showNetTransfer}
					viewMode={effectiveViewMode}
				/>
			)}
			{selectedServerId !== null && (
				<Suspense fallback={null}>
					<SakuraServerDetailDialog
						onClose={() => setSelectedServerId(null)}
						serverId={selectedServerId}
					/>
				</Suspense>
			)}
		</div>
	);
}
