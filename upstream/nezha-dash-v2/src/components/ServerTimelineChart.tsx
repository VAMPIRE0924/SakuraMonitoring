import * as React from "react";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@/components/ui/chart";

type TimelineValue = string | number;

type TimelineState = {
	active: boolean;
	activeValue?: TimelineValue;
	setActive: React.Dispatch<React.SetStateAction<boolean>>;
	setActiveValue: React.Dispatch<
		React.SetStateAction<TimelineValue | undefined>
	>;
};

const TimelineStateContext = React.createContext<TimelineState | null>(null);
const TimelineChartContext = React.createContext<{
	active: boolean;
	index?: number;
} | null>(null);

export function ServerTimelineProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [active, setActive] = React.useState(false);
	const [activeValue, setActiveValue] = React.useState<
		TimelineValue | undefined
	>();
	const state = React.useMemo(
		() => ({ active, activeValue, setActive, setActiveValue }),
		[active, activeValue],
	);

	return (
		<TimelineStateContext.Provider value={state}>
			{children}
		</TimelineStateContext.Provider>
	);
}

function useTimelineState() {
	const state = React.useContext(TimelineStateContext);
	if (!state) {
		throw new Error(
			"ServerTimelineChart must be used within ServerTimelineProvider",
		);
	}
	return state;
}

function getChartSurface(container: HTMLDivElement) {
	return container.querySelector<SVGSVGElement>(".recharts-surface");
}

function getPlotBounds(container: HTMLDivElement) {
	const surface = getChartSurface(container);
	if (!surface) return null;
	const surfaceBounds = surface.getBoundingClientRect();
	const gridLine = surface.querySelector<SVGLineElement>(
		".recharts-cartesian-grid-horizontal line",
	);
	const gridBounds = gridLine?.getBoundingClientRect();
	const left = gridBounds?.width ? gridBounds.left : surfaceBounds.left;
	const width = gridBounds?.width || surfaceBounds.width;
	return width > 0 ? { left, width } : null;
}

function findTimelineIndex(
	values: ReadonlyArray<TimelineValue>,
	activeValue?: TimelineValue,
) {
	if (activeValue === undefined || values.length === 0) return undefined;
	const numericValue = Number(activeValue);
	if (!Number.isFinite(numericValue)) {
		const exactIndex = values.findIndex(
			(value) => String(value) === String(activeValue),
		);
		return exactIndex >= 0 ? exactIndex : undefined;
	}

	let low = 0;
	let high = values.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (Number(values[middle]) < numericValue) low = middle + 1;
		else high = middle;
	}
	if (low === 0) return 0;
	if (low === values.length) return values.length - 1;
	return numericValue - Number(values[low - 1]) <=
		Number(values[low]) - numericValue
		? low - 1
		: low;
}

export const ServerTimelineChart = React.forwardRef<
	HTMLDivElement,
	{
		children: React.ComponentProps<typeof ChartContainer>["children"];
		className?: string;
		config: ChartConfig;
		timelineValues: ReadonlyArray<TimelineValue>;
	}
>(({ children, className, config, timelineValues }, ref) => {
	const { active, activeValue, setActive, setActiveValue } = useTimelineState();
	const activeIndex = React.useMemo(
		() => findTimelineIndex(timelineValues, activeValue),
		[activeValue, timelineValues],
	);
	const plotBoundsRef = React.useRef<{ left: number; width: number } | null>(
		null,
	);

	const updateFromPointer = React.useCallback(
		(container: HTMLDivElement, clientX: number) => {
			const bounds = plotBoundsRef.current ?? getPlotBounds(container);
			if (!bounds || timelineValues.length === 0) return;
			plotBoundsRef.current = bounds;
			const ratio = Math.min(
				1,
				Math.max(0, (clientX - bounds.left) / bounds.width),
			);
			const index = Math.round(ratio * (timelineValues.length - 1));
			setActiveValue(timelineValues[index]);
		},
		[setActiveValue, timelineValues],
	);

	const activate = React.useCallback(
		(container: HTMLDivElement, clientX: number, focus: boolean) => {
			updateFromPointer(container, clientX);
			setActive(true);
			if (!focus) return;
			const surface = getChartSurface(container);
			if (surface && surface !== document.activeElement) {
				surface.setAttribute("tabindex", "-1");
				surface.focus({ preventScroll: true });
			}
		},
		[setActive, updateFromPointer],
	);

	const deactivate = React.useCallback(
		(container: HTMLDivElement) => {
			setActive(false);
			plotBoundsRef.current = null;
			const surface = getChartSurface(container);
			if (surface && surface === document.activeElement) surface.blur();
		},
		[setActive],
	);

	return (
		<TimelineChartContext.Provider value={{ active, index: activeIndex }}>
			<ChartContainer
				ref={ref}
				config={config}
				className={className}
				data-timeline-interaction="true"
				data-tooltip-active={
					active && activeIndex !== undefined ? "true" : "false"
				}
				onPointerEnter={(event) =>
					activate(
						event.currentTarget,
						event.clientX,
						event.pointerType !== "touch",
					)
				}
				onPointerDownCapture={(event) =>
					activate(event.currentTarget, event.clientX, false)
				}
				onPointerMoveCapture={(event) =>
					activate(
						event.currentTarget,
						event.clientX,
						event.pointerType !== "touch",
					)
				}
				onPointerUpCapture={(event) => {
					if (event.pointerType !== "mouse") deactivate(event.currentTarget);
				}}
				onPointerCancelCapture={(event) => deactivate(event.currentTarget)}
				onPointerLeave={(event) => deactivate(event.currentTarget)}
				onLostPointerCaptureCapture={(event) => {
					if (event.pointerType !== "mouse") deactivate(event.currentTarget);
				}}
				onClickCapture={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
				onKeyDownCapture={(event) => {
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
					event.preventDefault();
					event.stopPropagation();
					if (timelineValues.length === 0) return;
					const nextIndex = Math.min(
						timelineValues.length - 1,
						Math.max(
							0,
							(activeIndex ?? 0) + (event.key === "ArrowLeft" ? -1 : 1),
						),
					);
					setActive(true);
					setActiveValue(timelineValues[nextIndex]);
				}}
			>
				{children}
			</ChartContainer>
		</TimelineChartContext.Provider>
	);
});
ServerTimelineChart.displayName = "ServerTimelineChart";

export function ServerTimelineTooltip(
	props: React.ComponentProps<typeof ChartTooltip>,
) {
	const timeline = React.useContext(TimelineChartContext);
	if (!timeline) {
		throw new Error(
			"ServerTimelineTooltip must be used within ServerTimelineChart",
		);
	}
	const active = timeline.active && timeline.index !== undefined;
	return (
		<ChartTooltip
			{...props}
			active={active}
			defaultIndex={timeline.index}
			trigger="click"
		/>
	);
}
