import { getCountry } from "countries-and-timezones";
import { geoBounds, geoContains } from "d3-geo";
import { ArrowDown, ArrowUp, RotateCcw, X } from "lucide-react";
import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { ResolvedServerFlag } from "@/components/ServerFlag";
import { formatRate } from "@/lib/format";
import { displaySakuraRegionName } from "@/lib/sakura-region";
import { cn, formatNezhaInfo } from "@/lib/utils";
import {
	type WorldCountryFeature,
	worldCountryFeatures,
	worldCountryMarkers,
} from "@/lib/world-map";
import type { NezhaServer } from "@/types/nezha-api";

type CountryFeature = WorldCountryFeature;

type CountryStatus = {
	code: string;
	servers: NezhaServer[];
	onlineCount: number;
};

type PointerPosition = { x: number; y: number };

const countries = worldCountryFeatures;
const countryHitRegions = countries.map((feature) => ({
	bounds: geoBounds(feature),
	feature,
}));
const RESTING_ALTITUDE = 2.1;
const MAX_GLOBE_SCALE = 2;
const HOVER_GLOBE_SCALE = 1.03;
const MAX_RENDER_PIXEL_RATIO = 5;
const MIN_RENDER_PIXEL_RATIO = 2;
const COUNTRY_ALTITUDE = 0.0025;
const DEFAULT_HIT_RADIUS_PERCENT = 31;
const INITIAL_POINT_OF_VIEW = {
	lat: 30,
	lng: 105,
	altitude: RESTING_ALTITUDE,
};

function countryAtCoordinates(lat: number, lng: number) {
	for (const { bounds, feature } of countryHitRegions) {
		const [[west, south], [east, north]] = bounds;
		if (lat < south || lat > north) continue;
		const withinLongitude =
			west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
		if (withinLongitude && geoContains(feature, [lng, lat])) return feature;
	}
	return null;
}

function normalizeCountryCode(value: string): string {
	return value.trim().toUpperCase();
}

function countryName(feature: CountryFeature, language: string): string {
	return displaySakuraRegionName(feature.properties.iso_a2_eh, language);
}

function countryTimezone(code: string): string {
	return getCountry(code)?.timezones[0] ?? "UTC";
}

function localTime(code: string): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		timeZone: countryTimezone(code),
	}).format(new Date());
}

function SakuraCountryLocalTime({ code }: { code: string }) {
	const [, setTick] = useState(0);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setTick((value) => value + 1);
		}, 1000);

		return () => window.clearInterval(timer);
	}, []);

	return <>{localTime(code)}</>;
}

function countryFill(status: CountryStatus | undefined, dark: boolean): string {
	if (!status || status.servers.length === 0) {
		return dark ? "#8293aa" : "#edf4f6";
	}

	const offlineRatio = 1 - status.onlineCount / status.servers.length;
	if (offlineRatio === 0) return dark ? "#438b82" : "#7bb9a9";
	if (offlineRatio === 1) return dark ? "#a95868" : "#d37a83";

	const warning = new THREE.Color(dark ? "#a6854d" : "#cba661");
	const danger = new THREE.Color(dark ? "#ad5968" : "#d17b80");
	const mix = Math.min(1, Math.max(0, (offlineRatio - 0.15) / 0.7));
	return `#${warning.lerp(danger, mix).getHexString()}`;
}

function interactiveCountryFill(
	status: CountryStatus | undefined,
	dark: boolean,
	interaction: "hovered" | "selected" | null,
): string {
	const base = new THREE.Color(countryFill(status, dark));
	if (!interaction) return `#${base.getHexString()}`;

	const target = new THREE.Color(
		interaction === "selected"
			? dark
				? "#a8e1da"
				: "#347f91"
			: dark
				? "#78c2b8"
				: "#599aa4",
	);
	return `#${base.lerp(target, interaction === "selected" ? 0.48 : 0.3).getHexString()}`;
}

function GlobeServerCard({
	forceUseSvgFlag,
	now,
	onOpen,
	server,
}: {
	forceUseSvgFlag: boolean;
	now: number;
	onOpen: () => void;
	server: NezhaServer;
}) {
	const { t } = useTranslation();
	const info = formatNezhaInfo(now, server);

	return (
		<button type="button" className="sakura-globe-server" onClick={onOpen}>
			<span
				className={cn("sakura-globe-server-status", {
					"is-online": info.online,
				})}
			/>
			<ResolvedServerFlag
				className="sakura-globe-server-flag"
				country_code={server.country_code}
				forceUseSvgFlag={forceUseSvgFlag}
			/>
			<span className="sakura-globe-server-copy">
				<strong>{server.name}</strong>
				<small>
					{info.platform || t("serverDetail.unknown")} ·{" "}
					{info.online ? t("serverDetail.online") : t("serverDetail.offline")}
				</small>
			</span>
			<span className="sakura-globe-server-rates">
				<span>
					<ArrowUp />{" "}
					{info.online ? formatRate(server.state.net_out_speed) : "--"}
				</span>
				<span>
					<ArrowDown />{" "}
					{info.online ? formatRate(server.state.net_in_speed) : "--"}
				</span>
			</span>
		</button>
	);
}

export default function SakuraGlobe({
	forceUseSvgFlag,
	now,
	onOpenServer,
	serverList,
}: {
	forceUseSvgFlag: boolean;
	now: number;
	onOpenServer: (serverId: number) => void;
	serverList: NezhaServer[];
}) {
	const { i18n, t } = useTranslation();
	const globeRef = useRef<GlobeMethods | undefined>(undefined);
	const stageRef = useRef<HTMLDivElement>(null);
	const orbitRef = useRef<HTMLDivElement>(null);
	const auraRef = useRef<HTMLDivElement>(null);
	const initialPointOfViewRef = useRef<{
		lat: number;
		lng: number;
		altitude: number;
	} | null>(null);
	const cameraDistanceRef = useRef<number | null>(null);
	const zoomResetTimerRef = useRef<number | null>(null);
	const zoomAnimationFrameRef = useRef<number | null>(null);
	const readyMeasureFrameRef = useRef<number | null>(null);
	const pointerAnimationFrameRef = useRef<number | null>(null);
	const pendingPointerRef = useRef<PointerPosition | null>(null);
	const zoomAnimationTimeRef = useRef(0);
	const zoomLevelRef = useRef(0);
	const zoomTargetRef = useRef(0);
	const hoverScaleRef = useRef(1);
	const hoverScaleTargetRef = useRef(1);
	const rendererPixelRatioRef = useRef(0);
	const sizeRef = useRef(640);
	const stageWidthRef = useRef(0);
	const stageBaseHeightRef = useRef(600);
	const pointerInsideRef = useRef(false);
	const pointerDownRef = useRef<PointerPosition | null>(null);
	const pointerDraggingRef = useRef(false);
	const pinchActiveRef = useRef(false);
	const pinchDistanceRef = useRef<number | null>(null);
	const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
	const tooltipRef = useRef<HTMLElement>(null);
	const hitRadiusRatioRef = useRef(DEFAULT_HIT_RADIUS_PERCENT / 100);
	const [size, setSize] = useState(640);
	const [hitRadiusPercent, setHitRadiusPercent] = useState(
		DEFAULT_HIT_RADIUS_PERCENT,
	);
	const [hovered, setHovered] = useState<CountryFeature | null>(null);
	const [selected, setSelected] = useState<CountryFeature | null>(null);
	const [pointerInside, setPointerInside] = useState(false);
	const [resetFeedbackKey, setResetFeedbackKey] = useState(0);
	const [dark, setDark] = useState(() =>
		document.documentElement.classList.contains("dark"),
	);
	const countryStatuses = useMemo(() => {
		const result = new Map<string, CountryStatus>();
		for (const server of serverList) {
			if (!server.country_code) continue;
			const code = normalizeCountryCode(server.country_code);
			const status = result.get(code) ?? {
				code,
				servers: [],
				onlineCount: 0,
			};
			status.servers.push(server);
			if (formatNezhaInfo(now, server).online) status.onlineCount += 1;
			result.set(code, status);
		}
		return result;
	}, [now, serverList]);
	const activeTinyCountryMarkers = useMemo(
		() =>
			worldCountryMarkers.filter((marker) =>
				countryStatuses.has(marker.feature.properties.iso_a2_eh),
			),
		[countryStatuses],
	);
	const globeMaterial = useMemo(() => {
		return new THREE.MeshPhongMaterial({
			color: dark ? "#123b55" : "#9fc9dc",
			emissive: dark ? "#0a293d" : "#6f9fb2",
			emissiveIntensity: dark ? 0.24 : 0.12,
			shininess: dark ? 24 : 18,
			specular: dark ? "#6eabc9" : "#cce6ef",
		});
	}, [dark]);

	const setRenderQuality = useCallback(() => {
		const globe = globeRef.current;
		if (!globe) return;
		const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);
		const ratio = Math.min(
			Math.max(devicePixelRatio, MIN_RENDER_PIXEL_RATIO) *
				MAX_GLOBE_SCALE *
				HOVER_GLOBE_SCALE,
			MAX_RENDER_PIXEL_RATIO,
		);
		if (Math.abs(rendererPixelRatioRef.current - ratio) < 0.05) return;
		globe.renderer().setPixelRatio(ratio);
		rendererPixelRatioRef.current = ratio;
	}, []);

	const renderZoomFrame = useCallback(() => {
		const scale =
			(1 + zoomLevelRef.current * (MAX_GLOBE_SCALE - 1)) *
			hoverScaleRef.current;
		const orbit = orbitRef.current;
		if (orbit) {
			orbit.style.transform = `translate(-50%, -50%) scale(${scale})`;
		}
		const aura = auraRef.current;
		if (aura) {
			aura.style.transform = `translate(-50%, -50%) scale(${scale})`;
		}

		const stage = stageRef.current;
		if (stage) {
			stage.style.height = `${stageBaseHeightRef.current + sizeRef.current * (scale - 1)}px`;
		}
	}, []);

	const startZoomAnimation = useCallback(() => {
		if (zoomAnimationFrameRef.current !== null) return;
		zoomAnimationTimeRef.current = 0;

		const tick = (timestamp: number) => {
			const elapsed = zoomAnimationTimeRef.current
				? Math.min(50, timestamp - zoomAnimationTimeRef.current)
				: 1000 / 60;
			zoomAnimationTimeRef.current = timestamp;
			const blend = 1 - 0.8 ** (elapsed / (1000 / 60));
			zoomLevelRef.current +=
				(zoomTargetRef.current - zoomLevelRef.current) * blend;
			hoverScaleRef.current +=
				(hoverScaleTargetRef.current - hoverScaleRef.current) * blend;

			const zoomSettled =
				Math.abs(zoomTargetRef.current - zoomLevelRef.current) < 0.0005;
			const hoverSettled =
				Math.abs(hoverScaleTargetRef.current - hoverScaleRef.current) < 0.0001;
			if (zoomSettled) zoomLevelRef.current = zoomTargetRef.current;
			if (hoverSettled) hoverScaleRef.current = hoverScaleTargetRef.current;
			renderZoomFrame();

			if (zoomSettled && hoverSettled) {
				zoomAnimationFrameRef.current = null;
				zoomAnimationTimeRef.current = 0;
				return;
			}
			zoomAnimationFrameRef.current = window.requestAnimationFrame(tick);
		};

		zoomAnimationFrameRef.current = window.requestAnimationFrame(tick);
	}, [renderZoomFrame]);

	const measureProjectedRadius = useCallback(() => {
		const globe = globeRef.current;
		if (!globe) return;

		const center = sizeRef.current / 2;
		let inside = 0;
		let outside = center;
		for (let index = 0; index < 14; index += 1) {
			const candidate = (inside + outside) / 2;
			if (globe.toGlobeCoords(center + candidate, center)) {
				inside = candidate;
			} else {
				outside = candidate;
			}
		}

		if (inside > 0) {
			const ratio = inside / sizeRef.current;
			hitRadiusRatioRef.current = ratio;
			setHitRadiusPercent(ratio * 100);
		}
	}, []);

	const handleGlobeReady = useCallback(() => {
		const globe = globeRef.current;
		if (!globe) return;
		setRenderQuality();
		const controls = globe.controls();
		controls.enableZoom = false;
		controls.enablePan = false;
		const restingView = { ...INITIAL_POINT_OF_VIEW };
		initialPointOfViewRef.current = restingView;
		globe.pointOfView(restingView, 0);
		const cameraDistance = globe.camera().position.length();
		cameraDistanceRef.current = cameraDistance;
		controls.minDistance = cameraDistance;
		controls.maxDistance = cameraDistance;
		controls.update();
		measureProjectedRadius();
		if (readyMeasureFrameRef.current !== null) {
			window.cancelAnimationFrame(readyMeasureFrameRef.current);
		}
		readyMeasureFrameRef.current = window.requestAnimationFrame(() => {
			readyMeasureFrameRef.current = null;
			measureProjectedRadius();
		});
	}, [measureProjectedRadius, setRenderQuality]);

	const pointerToGlobeCoords = useCallback(
		(clientX: number, clientY: number) => {
			const globe = globeRef.current;
			const orbit = orbitRef.current;
			if (!globe || !orbit) return null;

			const bounds = orbit.getBoundingClientRect();
			if (bounds.width <= 0 || bounds.height <= 0) return null;
			const viewportX =
				((clientX - bounds.left) / bounds.width) * sizeRef.current;
			const viewportY =
				((clientY - bounds.top) / bounds.height) * sizeRef.current;
			if (
				viewportX < 0 ||
				viewportY < 0 ||
				viewportX > sizeRef.current ||
				viewportY > sizeRef.current
			) {
				return null;
			}
			const center = sizeRef.current / 2;
			if (
				Math.hypot(viewportX - center, viewportY - center) >
				sizeRef.current * hitRadiusRatioRef.current
			) {
				return null;
			}

			return globe.toGlobeCoords(viewportX, viewportY);
		},
		[],
	);

	const isPointerOverGlobe = useCallback(
		(clientX: number, clientY: number) =>
			pointerToGlobeCoords(clientX, clientY) !== null,
		[pointerToGlobeCoords],
	);

	const countryAtPointer = useCallback(
		(clientX: number, clientY: number) => {
			const coords = pointerToGlobeCoords(clientX, clientY);
			if (!coords) return null;
			return countryAtCoordinates(coords.lat, coords.lng);
		},
		[pointerToGlobeCoords],
	);

	const lockCameraDistance = useCallback(() => {
		const globe = globeRef.current;
		const cameraDistance = cameraDistanceRef.current;
		if (!globe || cameraDistance === null) return;

		const controls = globe.controls();
		controls.enableZoom = false;
		controls.minDistance = cameraDistance;
		controls.maxDistance = cameraDistance;
		globe.pointOfView({ altitude: RESTING_ALTITUDE }, 0);
		controls.update();
	}, []);

	const setGlobeHover = useCallback(
		(inside: boolean) => {
			if (pointerInsideRef.current === inside) return;
			pointerInsideRef.current = inside;
			setPointerInside(inside);
			hoverScaleTargetRef.current = inside ? HOVER_GLOBE_SCALE : 1;
			startZoomAnimation();
			if (zoomResetTimerRef.current !== null) {
				window.clearTimeout(zoomResetTimerRef.current);
				zoomResetTimerRef.current = null;
			}
			if (!inside) {
				setHovered(null);
				zoomResetTimerRef.current = window.setTimeout(() => {
					zoomTargetRef.current = 0;
					startZoomAnimation();
					zoomResetTimerRef.current = null;
				}, 5000);
			}
		},
		[startZoomAnimation],
	);

	const resetGlobe = useCallback(() => {
		if (zoomResetTimerRef.current !== null) {
			window.clearTimeout(zoomResetTimerRef.current);
			zoomResetTimerRef.current = null;
		}
		if (zoomAnimationFrameRef.current !== null) {
			window.cancelAnimationFrame(zoomAnimationFrameRef.current);
			zoomAnimationFrameRef.current = null;
		}
		zoomAnimationTimeRef.current = 0;
		zoomLevelRef.current = 0;
		zoomTargetRef.current = 0;
		hoverScaleRef.current = 1;
		hoverScaleTargetRef.current = 1;
		pointerInsideRef.current = false;
		setPointerInside(false);
		setHovered(null);
		setSelected(null);
		renderZoomFrame();
		setRenderQuality();

		const globe = globeRef.current;
		if (globe && initialPointOfViewRef.current) {
			globe.pointOfView(initialPointOfViewRef.current, 420);
		}
	}, [renderZoomFrame, setRenderQuality]);

	const handleResetGlobe = useCallback(() => {
		setResetFeedbackKey((value) => value + 1);
		resetGlobe();
	}, [resetGlobe]);

	const statusFor = useCallback(
		(feature: object) => {
			const code = (
				feature as CountryFeature
			).properties.iso_a2_eh.toUpperCase();
			return countryStatuses.get(code);
		},
		[countryStatuses],
	);
	const createCountryMarker = useCallback(
		(marker: object) => {
			const countryMarker = marker as (typeof worldCountryMarkers)[number];
			const element = document.createElement("button");
			element.type = "button";
			element.className = "sakura-globe-marker";
			element.dataset.country = countryMarker.feature.properties.iso_a2_eh;
			element.setAttribute(
				"aria-label",
				countryName(countryMarker.feature, i18n.language),
			);
			element.addEventListener("pointerenter", () =>
				setHovered(countryMarker.feature),
			);
			element.addEventListener("pointerleave", () => setHovered(null));
			element.addEventListener("click", (event) => {
				event.stopPropagation();
				setSelected(countryMarker.feature);
			});
			return element;
		},
		[i18n.language],
	);

	useEffect(() => {
		const update = () => {
			const element = stageRef.current;
			if (!element) return;
			if (stageWidthRef.current === element.clientWidth) return;
			stageWidthRef.current = element.clientWidth;
			const maximumSize = window.matchMedia("(max-width: 640px)").matches
				? 620
				: 860;
			const mobile = window.matchMedia("(max-width: 640px)").matches;
			const canvasSize = Math.max(
				300,
				Math.min(element.clientWidth, maximumSize),
			);
			sizeRef.current = canvasSize;
			setSize(canvasSize);
			const baseHeight = mobile
				? Math.max(320, Math.min(370, window.innerWidth - 16))
				: Math.max(400, Math.min(680, canvasSize * 0.85));
			stageBaseHeightRef.current = baseHeight;
			renderZoomFrame();
		};
		update();
		const observer = new ResizeObserver(update);
		if (stageRef.current) observer.observe(stageRef.current);
		return () => observer.disconnect();
	}, [renderZoomFrame]);

	useEffect(
		() => () => {
			if (zoomResetTimerRef.current !== null) {
				window.clearTimeout(zoomResetTimerRef.current);
			}
			if (zoomAnimationFrameRef.current !== null) {
				window.cancelAnimationFrame(zoomAnimationFrameRef.current);
			}
			if (readyMeasureFrameRef.current !== null) {
				window.cancelAnimationFrame(readyMeasureFrameRef.current);
			}
			if (pointerAnimationFrameRef.current !== null) {
				window.cancelAnimationFrame(pointerAnimationFrameRef.current);
			}
		},
		[],
	);

	useEffect(() => {
		const finishPointerDrag = () => {
			pointerDownRef.current = null;
			pointerDraggingRef.current = false;
		};
		window.addEventListener("pointerup", finishPointerDrag);
		window.addEventListener("pointercancel", finishPointerDrag);
		return () => {
			window.removeEventListener("pointerup", finishPointerDrag);
			window.removeEventListener("pointercancel", finishPointerDrag);
		};
	}, []);

	useEffect(() => {
		const observer = new MutationObserver(() =>
			setDark(document.documentElement.classList.contains("dark")),
		);
		observer.observe(document.documentElement, {
			attributeFilter: ["class"],
			attributes: true,
		});
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const globe = globeRef.current;
		if (!globe) return;
		const ambient = new THREE.HemisphereLight(
			dark ? "#8dbbd2" : "#eefbff",
			dark ? "#06131e" : "#7fa8b8",
			dark ? 1.05 : 1.15,
		);
		const key = new THREE.DirectionalLight(
			dark ? "#c7e8ff" : "#ffffff",
			dark ? 1.15 : 0.82,
		);
		key.position.set(-140, 105, 120);
		globe.lights([ambient, key]);
	}, [dark]);

	useEffect(() => {
		const orbit = orbitRef.current;
		if (!orbit) return;
		const touchDistance = (touches: TouchList) => {
			const first = touches.item(0);
			const second = touches.item(1);
			if (!first || !second) return null;
			return Math.hypot(
				second.clientX - first.clientX,
				second.clientY - first.clientY,
			);
		};
		const touchCenter = (touches: TouchList) => {
			const first = touches.item(0);
			const second = touches.item(1);
			if (!first || !second) return null;
			return {
				x: (first.clientX + second.clientX) / 2,
				y: (first.clientY + second.clientY) / 2,
			};
		};
		const handleMouseEnter = (event: MouseEvent) =>
			setGlobeHover(isPointerOverGlobe(event.clientX, event.clientY));
		const handleMouseLeave = () => {
			setGlobeHover(false);
			setHovered(null);
		};
		const handleWheel = (event: WheelEvent) => {
			if (!isPointerOverGlobe(event.clientX, event.clientY)) return;
			event.preventDefault();
			event.stopPropagation();
			lockCameraDistance();
			const direction = event.deltaY < 0 ? 1 : -1;
			zoomTargetRef.current = Math.min(
				1,
				Math.max(0, zoomTargetRef.current + direction * 0.05),
			);
			startZoomAnimation();
		};
		const handleTouchStart = (event: TouchEvent) => {
			if (event.touches.length !== 2) return;
			const center = touchCenter(event.touches);
			if (!center || !isPointerOverGlobe(center.x, center.y)) return;
			const distance = touchDistance(event.touches);
			if (distance === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			pinchActiveRef.current = true;
			pinchDistanceRef.current = distance;
			setGlobeHover(true);
		};
		const handleTouchMove = (event: TouchEvent) => {
			if (!pinchActiveRef.current || event.touches.length !== 2) return;
			const distance = touchDistance(event.touches);
			const previousDistance = pinchDistanceRef.current;
			if (distance === null || previousDistance === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			lockCameraDistance();
			const distanceRatio = Math.max(
				0.5,
				Math.min(2, distance / previousDistance),
			);
			zoomTargetRef.current = Math.min(
				1,
				Math.max(0, zoomTargetRef.current + Math.log(distanceRatio) * 0.72),
			);
			pinchDistanceRef.current = distance;
			startZoomAnimation();
		};
		const handleTouchEnd = (event: TouchEvent) => {
			if (!pinchActiveRef.current) return;
			if (event.touches.length >= 2) {
				pinchDistanceRef.current = touchDistance(event.touches);
				return;
			}
			pinchActiveRef.current = false;
			pinchDistanceRef.current = null;
		};
		orbit.addEventListener("mouseenter", handleMouseEnter);
		orbit.addEventListener("mouseleave", handleMouseLeave);
		orbit.addEventListener("wheel", handleWheel, {
			capture: true,
			passive: false,
		});
		orbit.addEventListener("touchstart", handleTouchStart, {
			capture: true,
			passive: false,
		});
		orbit.addEventListener("touchmove", handleTouchMove, {
			capture: true,
			passive: false,
		});
		orbit.addEventListener("touchend", handleTouchEnd, true);
		orbit.addEventListener("touchcancel", handleTouchEnd, true);
		return () => {
			orbit.removeEventListener("mouseenter", handleMouseEnter);
			orbit.removeEventListener("mouseleave", handleMouseLeave);
			orbit.removeEventListener("wheel", handleWheel, true);
			orbit.removeEventListener("touchstart", handleTouchStart, true);
			orbit.removeEventListener("touchmove", handleTouchMove, true);
			orbit.removeEventListener("touchend", handleTouchEnd, true);
			orbit.removeEventListener("touchcancel", handleTouchEnd, true);
		};
	}, [
		isPointerOverGlobe,
		lockCameraDistance,
		setGlobeHover,
		startZoomAnimation,
	]);

	useEffect(() => {
		const globe = globeRef.current;
		if (!globe) return;
		const controls = globe.controls();
		controls.autoRotate = !pointerInside;
		controls.autoRotateSpeed = 0.28;
		controls.enableDamping = true;
		controls.dampingFactor = 0.16;
		controls.rotateSpeed = 0.92;
		controls.enableZoom = false;
		controls.enablePan = false;
		if (cameraDistanceRef.current !== null) {
			controls.minDistance = cameraDistanceRef.current;
			controls.maxDistance = cameraDistanceRef.current;
		}
	}, [pointerInside]);

	useEffect(() => () => globeMaterial.dispose(), [globeMaterial]);

	const activeFeature = selected ?? hovered;
	const activeStatus = activeFeature ? statusFor(activeFeature) : undefined;
	const activeServerCount = activeStatus?.servers.length ?? 0;
	const activeOfflineCount = activeStatus
		? activeStatus.servers.length - activeStatus.onlineCount
		: 0;
	const activeCode = activeFeature?.properties.iso_a2_eh.toUpperCase() ?? "";
	const activeName = activeFeature
		? countryName(activeFeature, i18n.language)
		: "";
	const hoveredCode = hovered?.properties.iso_a2_eh.toUpperCase() ?? "";
	const selectedCode = selected?.properties.iso_a2_eh.toUpperCase() ?? "";
	const fillFor = useCallback(
		(feature: object) => {
			const code = (
				feature as CountryFeature
			).properties.iso_a2_eh.toUpperCase();
			const interaction =
				code === selectedCode
					? "selected"
					: code === hoveredCode
						? "hovered"
						: null;
			return interactiveCountryFill(statusFor(feature), dark, interaction);
		},
		[dark, hoveredCode, selectedCode, statusFor],
	);
	const processPointer = (clientX: number, clientY: number) => {
		const bounds = stageRef.current?.getBoundingClientRect();
		if (!bounds) return;
		pointerRef.current = {
			x: clientX - bounds.left,
			y: clientY - bounds.top,
		};
		if (tooltipRef.current) {
			tooltipRef.current.style.left = `${pointerRef.current.x}px`;
			tooltipRef.current.style.top = `${pointerRef.current.y}px`;
		}
		const coords = pointerToGlobeCoords(clientX, clientY);
		setGlobeHover(coords !== null);
		if (!pointerDraggingRef.current) {
			setHovered(coords ? countryAtCoordinates(coords.lat, coords.lng) : null);
		}
	};
	const updatePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
		pendingPointerRef.current = { x: event.clientX, y: event.clientY };
		if (pointerAnimationFrameRef.current !== null) return;
		pointerAnimationFrameRef.current = window.requestAnimationFrame(() => {
			pointerAnimationFrameRef.current = null;
			const pending = pendingPointerRef.current;
			pendingPointerRef.current = null;
			if (pending) processPointer(pending.x, pending.y);
		});
	};
	const clearPointer = () => {
		if (pointerDraggingRef.current) return;
		if (pointerAnimationFrameRef.current !== null) {
			window.cancelAnimationFrame(pointerAnimationFrameRef.current);
			pointerAnimationFrameRef.current = null;
		}
		pendingPointerRef.current = null;
		setGlobeHover(false);
		setHovered(null);
	};

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (
			(event.pointerType === "mouse" && event.button !== 0) ||
			!isPointerOverGlobe(event.clientX, event.clientY)
		) {
			pointerDownRef.current = null;
			return;
		}
		pointerDownRef.current = { x: event.clientX, y: event.clientY };
		pointerDraggingRef.current = true;
	};

	const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		const start = pointerDownRef.current;
		pointerDownRef.current = null;
		pointerDraggingRef.current = false;
		if (!start) return;
		if ((event.target as Element).closest(".sakura-globe-marker")) return;
		if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5)
			return;

		const feature = countryAtPointer(event.clientX, event.clientY);
		if (feature) setSelected(feature);
	};

	const handlePointerCancel = () => {
		pointerDownRef.current = null;
		pointerDraggingRef.current = false;
		setHovered(null);
	};

	return (
		<div
			ref={stageRef}
			className="sakura-globe-stage"
			onPointerMove={updatePointer}
			onPointerLeave={clearPointer}
		>
			<button
				type="button"
				className="sakura-globe-reset"
				aria-label={t("map.ResetView", { defaultValue: "重置视角" })}
				title={t("map.ResetView", { defaultValue: "重置视角" })}
				onClick={handleResetGlobe}
			>
				<RotateCcw
					key={resetFeedbackKey}
					className={cn({ "is-resetting": resetFeedbackKey > 0 })}
				/>
			</button>
			<div
				ref={auraRef}
				className="sakura-globe-aura"
				style={{
					width: size * (hitRadiusPercent / 50),
					height: size * (hitRadiusPercent / 50),
				}}
			/>
			<div
				ref={orbitRef}
				className="sakura-globe-orbit"
				style={{
					width: size,
					height: size,
					clipPath: `circle(${hitRadiusPercent}% at 50% 50%)`,
				}}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerCancel}
			>
				<Globe
					ref={globeRef}
					width={size}
					height={size}
					backgroundColor="rgba(0,0,0,0)"
					rendererConfig={{
						alpha: true,
						antialias: true,
						powerPreference: "high-performance",
					}}
					enablePointerInteraction={false}
					globeMaterial={globeMaterial}
					globeCurvatureResolution={2}
					atmosphereColor={dark ? "#79c8ea" : "#8fdcf0"}
					atmosphereAltitude={dark ? 0.12 : 0.105}
					onGlobeReady={handleGlobeReady}
					polygonsData={countries}
					polygonAltitude={COUNTRY_ALTITUDE}
					polygonCapCurvatureResolution={2}
					polygonCapColor={fillFor}
					polygonSideColor={() => "rgba(0, 0, 0, 0)"}
					polygonStrokeColor={() => false}
					polygonsTransitionDuration={0}
					htmlElementsData={activeTinyCountryMarkers}
					htmlLat="lat"
					htmlLng="lng"
					htmlAltitude={0.008}
					htmlElement={createCountryMarker}
				/>
			</div>

			{hovered && !selected && (
				<aside
					ref={tooltipRef}
					className="sakura-globe-tooltip"
					style={{ left: pointerRef.current.x, top: pointerRef.current.y }}
				>
					<strong>{activeName}</strong>
					<span>{t("map.ServerCount", { count: activeServerCount })}</span>
					{activeOfflineCount > 0 && (
						<span className="sakura-globe-tooltip-offline">
							{t("map.OfflineSummary", { count: activeOfflineCount })}
						</span>
					)}
					<span>
						{t("map.LocalTime", { defaultValue: "当地时间" })}：
						<SakuraCountryLocalTime code={activeCode} />
					</span>
				</aside>
			)}

			{selected && (
				<section className="sakura-globe-country" aria-label={activeName}>
					<button
						type="button"
						className="sakura-globe-close"
						aria-label={t("common.close")}
						onClick={() => setSelected(null)}
					>
						<X />
					</button>
					<header>
						<h2>{activeName}</h2>
						<p>
							{t("map.ServerCount", { count: activeServerCount })}
							{activeOfflineCount > 0 && (
								<> · {t("map.OfflineServers", { count: activeOfflineCount })}</>
							)}{" "}
							· {t("map.LocalTime", { defaultValue: "当地时间" })}：
							<SakuraCountryLocalTime code={activeCode} />
						</p>
					</header>
					<div className="sakura-globe-server-list">
						{activeStatus?.servers.length ? (
							activeStatus.servers.map((server) => (
								<GlobeServerCard
									forceUseSvgFlag={forceUseSvgFlag}
									key={server.id}
									now={now}
									onOpen={() => onOpenServer(server.id)}
									server={server}
								/>
							))
						) : (
							<p className="sakura-globe-empty">{t("info.noServers")}</p>
						)}
					</div>
				</section>
			)}
		</div>
	);
}
