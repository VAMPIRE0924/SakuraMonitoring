import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("recharts")>();
	return {
		...actual,
		Tooltip: ({
			active,
			defaultIndex,
		}: {
			active?: boolean;
			defaultIndex?: number;
		}) => (
			<span data-index={defaultIndex} data-testid="tooltip-active">
				{active === false ? "hidden" : "automatic"}
			</span>
		),
		ResponsiveContainer: ({ children }: { children?: ReactNode }) => children,
	};
});

import {
	ServerTimelineChart,
	ServerTimelineProvider,
	ServerTimelineTooltip,
} from "@/components/ServerTimelineChart";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";

describe("chart pointer interaction", () => {
	it("shares tooltip state across pointer and keyboard input", () => {
		const parentKeyDown = vi.fn();
		const { container } = render(
			<div onKeyDown={parentKeyDown}>
				<ServerTimelineProvider>
					<ServerTimelineChart config={{}} timelineValues={[1, 2, 3]}>
						<div>
							<button
								aria-label="Interactive chart"
								className="recharts-surface"
								type="button"
							/>
							<ServerTimelineTooltip />
						</div>
					</ServerTimelineChart>
				</ServerTimelineProvider>
			</div>,
		);
		const chart = container.querySelector<HTMLElement>("[data-chart]");
		const surface = container.querySelector<HTMLElement>(".recharts-surface");
		expect(chart).not.toBeNull();
		expect(surface).not.toBeNull();
		vi.spyOn(surface as HTMLElement, "getBoundingClientRect").mockReturnValue({
			bottom: 100,
			height: 100,
			left: 0,
			right: 100,
			top: 0,
			width: 100,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("hidden");

		fireEvent.pointerUp(chart as HTMLElement, { pointerType: "touch" });
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("hidden");
		expect(chart).toHaveAttribute("data-tooltip-active", "false");

		fireEvent.keyDown(surface as HTMLElement, { key: "ArrowRight" });
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("automatic");
		expect(parentKeyDown).not.toHaveBeenCalled();

		fireEvent.pointerMove(chart as HTMLElement, { pointerType: "pen" });
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("automatic");

		fireEvent.pointerCancel(chart as HTMLElement, { pointerType: "pen" });
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("hidden");

		fireEvent.pointerMove(chart as HTMLElement, {
			clientX: 50,
			pointerType: "mouse",
		});
		expect(surface).toHaveFocus();
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("automatic");
		expect(screen.getByTestId("tooltip-active")).toHaveAttribute(
			"data-index",
			"1",
		);
		fireEvent.keyDown(surface as HTMLElement, { key: "ArrowRight" });
		expect(screen.getByTestId("tooltip-active")).toHaveAttribute(
			"data-index",
			"2",
		);
		fireEvent.pointerMove(chart as HTMLElement, { pointerType: "mouse" });
		fireEvent.pointerUp(chart as HTMLElement, { pointerType: "mouse" });
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("automatic");

		fireEvent.pointerLeave(chart as HTMLElement, { pointerType: "mouse" });
		expect(screen.getByTestId("tooltip-active")).toHaveTextContent("hidden");
		expect(surface).not.toHaveFocus();
	});

	it("keeps synchronized charts visible while moving between cards", () => {
		const { container } = render(
			<ServerTimelineProvider>
				<ServerTimelineChart config={{}} timelineValues={[1]}>
					<div>
						<button className="recharts-surface" type="button" />
						<ServerTimelineTooltip />
					</div>
				</ServerTimelineChart>
				<ServerTimelineChart config={{}} timelineValues={[1]}>
					<div>
						<button className="recharts-surface" type="button" />
						<ServerTimelineTooltip />
					</div>
				</ServerTimelineChart>
			</ServerTimelineProvider>,
		);
		const charts = container.querySelectorAll<HTMLElement>("[data-chart]");
		const surfaces =
			container.querySelectorAll<HTMLElement>(".recharts-surface");
		for (const surface of surfaces) {
			vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
				bottom: 100,
				height: 100,
				left: 0,
				right: 100,
				top: 0,
				width: 100,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});
		}

		fireEvent.pointerEnter(charts[0], { pointerType: "mouse" });
		fireEvent.pointerLeave(charts[0], { pointerType: "mouse" });
		fireEvent.pointerEnter(charts[1], { pointerType: "mouse" });

		expect(charts[0]).toHaveAttribute("data-tooltip-active", "true");
		expect(charts[1]).toHaveAttribute("data-tooltip-active", "true");

		fireEvent.pointerLeave(charts[1], { pointerType: "mouse" });
		expect(charts[0]).toHaveAttribute("data-tooltip-active", "false");
		expect(charts[1]).toHaveAttribute("data-tooltip-active", "false");
	});

	it("does not add detail timeline behavior to ordinary charts", () => {
		const parentKeyDown = vi.fn();
		const { container } = render(
			<div onKeyDown={parentKeyDown}>
				<ChartContainer config={{}}>
					<div>
						<button
							aria-label="Ordinary chart"
							className="recharts-surface"
							type="button"
						/>
						<ChartTooltip />
					</div>
				</ChartContainer>
			</div>,
		);
		const chart = container.querySelector<HTMLElement>("[data-chart]");
		const surface = screen.getByRole("button", { name: "Ordinary chart" });

		expect(chart).not.toHaveAttribute("data-timeline-interaction");
		fireEvent.mouseEnter(chart as HTMLElement);
		expect(surface).not.toHaveFocus();
		fireEvent.keyDown(surface, { key: "ArrowRight" });
		expect(parentKeyDown).toHaveBeenCalledTimes(1);
	});
});
