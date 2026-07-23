import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SakuraMapPanel from "@/sakura/SakuraMapPanel";
import { createServer } from "@/test/fixtures";

let latestGlobeProps: Record<string, unknown> = {};
let globeRenderCount = 0;
let currentGlobeView = { lat: 0, lng: 0, altitude: 2.5 };
const globePointOfView = vi.fn((view?: Partial<typeof currentGlobeView>) => {
	if (view) currentGlobeView = { ...currentGlobeView, ...view };
	return currentGlobeView;
});
const setPixelRatio = vi.fn();
const toGlobeCoords = vi.fn((x: number, y: number) =>
	Math.hypot(x - 320, y - 320) <= 190 ? { lat: 38, lng: -97 } : null,
);
const updateControls = vi.fn();
const setLights = vi.fn();
const addControlListener = vi.fn();
const removeControlListener = vi.fn();
const globeControls = {
	addEventListener: addControlListener,
	enableZoom: true,
	maxDistance: Number.POSITIVE_INFINITY,
	minDistance: 0,
	removeEventListener: removeControlListener,
	update: updateControls,
};

vi.mock("react-globe.gl", async () => {
	const React = await import("react");
	return {
		default: React.forwardRef(function GlobeMock(props, ref) {
			globeRenderCount += 1;
			latestGlobeProps = props as Record<string, unknown>;
			React.useImperativeHandle(ref, () => ({
				camera: () => ({ position: { length: () => 420 } }),
				controls: () => globeControls,
				lights: setLights,
				pointOfView: globePointOfView,
				renderer: () => ({ setPixelRatio }),
				toGlobeCoords,
			}));
			return <canvas data-testid="sakura-globe" />;
		}),
	};
});

const now = Date.parse("2025-01-01T00:00:20.000Z");

function renderMap(ui: React.ReactElement) {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function mockOrbitBounds(orbit: HTMLElement, size = 1000) {
	vi.spyOn(orbit, "getBoundingClientRect").mockReturnValue({
		bottom: size,
		height: size,
		left: 0,
		right: size,
		top: 0,
		width: size,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	});
}

describe("SakuraMapPanel", () => {
	beforeEach(() => {
		latestGlobeProps = {};
		globeRenderCount = 0;
		currentGlobeView = { lat: 0, lng: 0, altitude: 2.5 };
		globePointOfView.mockClear();
		setPixelRatio.mockClear();
		toGlobeCoords.mockClear();
		updateControls.mockClear();
		setLights.mockClear();
		addControlListener.mockClear();
		removeControlListener.mockClear();
		globeControls.enableZoom = true;
		globeControls.maxDistance = Number.POSITIVE_INFINITY;
		globeControls.minDistance = 0;
		window.ForceUseSvgFlag = true;
	});

	it("renders Sakura's final globe shell directly", () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "us" })]}
			/>,
		);

		const panel = container.querySelector("section.sakura-map-panel");
		expect(panel).toBeInTheDocument();
		expect(panel?.querySelector(":scope > section")).not.toBeInTheDocument();
		expect(screen.getByTestId("sakura-globe")).toBeInTheDocument();
	});

	it("only creates tiny-country markers for countries with servers", () => {
		window.ForceUseSvgFlag = true;
		renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "sg", name: "sg-edge" })]}
			/>,
		);

		const markers = latestGlobeProps.htmlElementsData as Array<{
			feature: { properties: { iso_a2_eh: string } };
		}>;
		expect(
			markers.map((marker) => marker.feature.properties.iso_a2_eh),
		).toEqual(["SG"]);

		const markerElement = (
			latestGlobeProps.htmlElement as (
				marker: (typeof markers)[number],
			) => HTMLElement
		)(markers[0]);
		act(() => markerElement.dispatchEvent(new PointerEvent("pointerenter")));
		expect(screen.getByText("Singapore")).toBeInTheDocument();

		act(() => markerElement.click());
		expect(
			screen.getByRole("region", { name: "Singapore" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /sg-edge/ })).toBeInTheDocument();
	});

	it("updates the country clock without rerendering the WebGL globe", () => {
		vi.useFakeTimers();
		try {
			renderMap(
				<SakuraMapPanel
					now={now}
					serverList={[createServer({ country_code: "sg" })]}
				/>,
			);

			const markers = latestGlobeProps.htmlElementsData as Array<{
				feature: { properties: { iso_a2_eh: string } };
			}>;
			const markerElement = (
				latestGlobeProps.htmlElement as (
					marker: (typeof markers)[number],
				) => HTMLElement
			)(markers[0]);
			act(() => markerElement.dispatchEvent(new PointerEvent("pointerenter")));

			const renderCountWithTooltip = globeRenderCount;
			act(() => vi.advanceTimersByTime(1000));
			expect(globeRenderCount).toBe(renderCountWithTooltip);
		} finally {
			vi.useRealTimers();
		}
	});

	it("resets zoom and orientation with one click", () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "cn" })]}
			/>,
		);

		act(() => (latestGlobeProps.onGlobeReady as () => void)());
		const orbit = container.querySelector(".sakura-globe-orbit") as HTMLElement;
		const reset = container.querySelector(".sakura-globe-reset") as HTMLElement;
		fireEvent.mouseEnter(orbit);
		fireEvent.wheel(orbit, { deltaY: -100 });
		globePointOfView.mockClear();
		fireEvent.click(reset);

		expect(globePointOfView).toHaveBeenLastCalledWith(
			{ altitude: 2.1, lat: 30, lng: 105 },
			420,
		);
		expect(orbit.style.transform).toBe("translate(-50%, -50%) scale(1)");
	});

	it("clears native text selection before globe gestures and reset", () => {
		const removeAllRanges = vi.fn();
		const getSelection = vi
			.spyOn(window, "getSelection")
			.mockReturnValue({ removeAllRanges } as unknown as Selection);
		try {
			const { container } = renderMap(
				<SakuraMapPanel
					now={now}
					serverList={[createServer({ country_code: "cn" })]}
				/>,
			);
			const stage = container.querySelector(
				".sakura-globe-stage",
			) as HTMLElement;
			const reset = container.querySelector(
				".sakura-globe-reset",
			) as HTMLElement;

			fireEvent.pointerDown(stage, { button: 0, pointerType: "mouse" });
			fireEvent.click(reset);

			expect(removeAllRanges).toHaveBeenCalledTimes(2);
		} finally {
			getSelection.mockRestore();
		}
	});

	it("locks the internal camera while wheel zoom scales the whole globe", () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "cn" })]}
			/>,
		);

		act(() => (latestGlobeProps.onGlobeReady as () => void)());
		const orbit = container.querySelector(".sakura-globe-orbit") as HTMLElement;
		mockOrbitBounds(orbit);
		globePointOfView.mockClear();
		fireEvent.wheel(orbit, { clientX: 500, clientY: 500, deltaY: -100 });

		expect(globeControls.enableZoom).toBe(false);
		expect(globeControls.minDistance).toBe(420);
		expect(globeControls.maxDistance).toBe(420);
		expect(globePointOfView).toHaveBeenCalledWith({ altitude: 2.1 }, 0);
		const zoomPixelRatio =
			setPixelRatio.mock.calls[setPixelRatio.mock.calls.length - 1]?.[0];
		expect(zoomPixelRatio).toBeCloseTo(4.12);

		for (let step = 0; step < 19; step += 1) {
			fireEvent.wheel(orbit, {
				clientX: 500,
				clientY: 500,
				deltaY: -100,
			});
		}
		expect(setPixelRatio).toHaveBeenCalledTimes(1);
		expect(latestGlobeProps.rendererConfig).toEqual({
			alpha: true,
			antialias: true,
			powerPreference: "high-performance",
		});
	});

	it("clears stale hover when the pointer leaves the globe surface", async () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "us" })]}
			/>,
		);
		const orbit = container.querySelector(".sakura-globe-orbit") as HTMLElement;
		const stage = container.querySelector(".sakura-globe-stage") as HTMLElement;
		mockOrbitBounds(orbit);
		fireEvent.pointerMove(orbit, { clientX: 500, clientY: 500 });
		await waitFor(() =>
			expect(screen.getByText("United States")).toBeInTheDocument(),
		);

		fireEvent.pointerMove(stage, { clientX: 950, clientY: 500 });
		await waitFor(() =>
			expect(screen.queryByText("United States")).not.toBeInTheDocument(),
		);
	});

	it("clips the DOM interaction surface to the projected globe", () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "us" })]}
			/>,
		);
		const orbit = container.querySelector(".sakura-globe-orbit") as HTMLElement;

		act(() => (latestGlobeProps.onGlobeReady as () => void)());

		expect(orbit.style.clipPath).toMatch(/^circle\(29\.6\d+% at 50% 50%\)$/);
	});

	it("only consumes wheel input over the projected globe surface", () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "cn" })]}
			/>,
		);
		act(() => (latestGlobeProps.onGlobeReady as () => void)());
		const orbit = container.querySelector(".sakura-globe-orbit") as HTMLElement;
		mockOrbitBounds(orbit, 2000);

		const outsideWheel = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			clientX: 100,
			clientY: 100,
			deltaY: -100,
		});
		orbit.dispatchEvent(outsideWheel);
		expect(outsideWheel.defaultPrevented).toBe(false);

		const globeWheel = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			clientX: 1000,
			clientY: 1000,
			deltaY: -100,
		});
		orbit.dispatchEvent(globeWheel);
		expect(globeWheel.defaultPrevented).toBe(true);
		expect(toGlobeCoords).toHaveBeenLastCalledWith(320, 320);
	});

	it("recovers hover after a drag is released outside the globe", async () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "us" })]}
			/>,
		);
		const orbit = container.querySelector(".sakura-globe-orbit") as HTMLElement;
		mockOrbitBounds(orbit);

		fireEvent.pointerDown(orbit, { clientX: 500, clientY: 500 });
		fireEvent.pointerLeave(orbit, { clientX: 900, clientY: 500 });
		fireEvent.pointerUp(window, { clientX: 900, clientY: 500 });
		fireEvent.pointerMove(orbit, { clientX: 500, clientY: 500 });

		expect(await screen.findByText("United States")).toBeInTheDocument();
	});

	it("uses color-only feedback without lifting country geometry", async () => {
		const { container } = renderMap(
			<SakuraMapPanel
				now={now}
				serverList={[createServer({ country_code: "us" })]}
			/>,
		);
		const orbit = container.querySelector(".sakura-globe-orbit") as HTMLElement;
		mockOrbitBounds(orbit);
		const unitedStates = (
			latestGlobeProps.polygonsData as Array<{
				properties: { iso_a2_eh: string };
			}>
		).find((feature) => feature.properties.iso_a2_eh === "US") as object;
		const fill = () =>
			(latestGlobeProps.polygonCapColor as (feature: object) => string)(
				unitedStates,
			);
		const defaultFill = fill();

		fireEvent.pointerMove(orbit, { clientX: 500, clientY: 500 });
		await waitFor(() => expect(fill()).not.toBe(defaultFill));
		const hoveredFill = fill();
		fireEvent.pointerDown(orbit, {
			clientX: 500,
			clientY: 500,
			isPrimary: true,
		});
		fireEvent.pointerUp(orbit, {
			clientX: 500,
			clientY: 500,
			isPrimary: true,
		});

		expect(hoveredFill).not.toBe(defaultFill);
		expect(
			screen.getByRole("region", { name: "United States" }),
		).toBeInTheDocument();
		await waitFor(() => expect(fill()).not.toBe(hoveredFill));
		expect(latestGlobeProps.polygonAltitude).toBe(0.0025);
	});
});
