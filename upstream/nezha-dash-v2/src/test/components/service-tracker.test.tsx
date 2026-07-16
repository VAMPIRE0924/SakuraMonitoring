import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceTrackerClient } from "@/components/ServiceTrackerClient";
import SakuraServicePanel from "@/sakura/SakuraServicePanel";
import type { ServiceResponse } from "@/types/nezha-api";

describe("ServiceTrackerClient", () => {
	it("uses uptime and delay severity colors", () => {
		const days = [
			{
				completed: true,
				date: new Date("2025-01-01T00:00:00.000Z"),
				uptime: 99.5,
				delay: 80,
			},
			{
				completed: false,
				date: new Date("2025-01-02T00:00:00.000Z"),
				uptime: 90,
				delay: 320,
			},
		];

		const { rerender } = render(
			<ServiceTrackerClient
				title="API"
				uptime={99.9}
				avgDelay={80}
				days={days}
			/>,
		);
		expect(screen.getByText("99.9% serviceTracker.uptime")).toHaveClass(
			"text-emerald-500",
		);
		expect(screen.getByText("80ms")).toHaveClass("text-emerald-500");

		rerender(
			<ServiceTrackerClient
				title="API"
				uptime={97}
				avgDelay={180}
				days={days}
			/>,
		);
		expect(screen.getByText("97.0% serviceTracker.uptime")).toHaveClass(
			"text-amber-500",
		);
		expect(screen.getByText("180ms")).toHaveClass("text-amber-500");

		rerender(
			<ServiceTrackerClient
				title="API"
				uptime={94}
				avgDelay={320}
				days={days}
			/>,
		);
		expect(screen.getByText("94.0% serviceTracker.uptime")).toHaveClass(
			"text-rose-500",
		);
		expect(screen.getByText("320ms")).toHaveClass("text-rose-500");
	});

	it("previews touched days, scrubs between them, and closes after a drag", () => {
		const days = [
			{
				completed: true,
				date: new Date("2025-01-01T00:00:00.000Z"),
				uptime: 100,
				delay: 20,
			},
			{
				completed: false,
				date: new Date("2025-01-02T00:00:00.000Z"),
				uptime: 90,
				delay: 320,
			},
		];
		const { container } = render(
			<ServiceTrackerClient title="API" days={days} variant="sakura" />,
		);
		const tracker = container.querySelector<HTMLElement>(
			".service-tracker-days",
		);
		const dayButtons = Array.from(
			container.querySelectorAll<HTMLElement>("[data-service-day-index]"),
		);
		expect(tracker).not.toBeNull();
		expect(dayButtons).toHaveLength(2);

		fireEvent.pointerDown(dayButtons[0], {
			pointerId: 7,
			pointerType: "touch",
			clientX: 10,
			clientY: 10,
		});
		expect(
			document.querySelector('[data-service-day-tooltip="0"]'),
		).toBeInTheDocument();

		Object.defineProperty(document, "elementFromPoint", {
			configurable: true,
			value: vi.fn(() => dayButtons[1]),
		});
		fireEvent.pointerMove(tracker as HTMLElement, {
			pointerId: 7,
			pointerType: "touch",
			clientX: 40,
			clientY: 10,
		});
		expect(
			document.querySelector('[data-service-day-tooltip="1"]'),
		).toBeInTheDocument();

		fireEvent.pointerUp(tracker as HTMLElement, {
			pointerId: 7,
			pointerType: "touch",
			clientX: 40,
			clientY: 10,
		});
		expect(document.querySelector("[data-service-day-tooltip]")).toBeNull();
	});

	it("keeps a tapped day visible until the next outside interaction", () => {
		const { container } = render(
			<ServiceTrackerClient
				title="API"
				variant="sakura"
				days={[
					{
						completed: true,
						date: new Date("2025-01-01T00:00:00.000Z"),
						uptime: 100,
						delay: 20,
					},
				]}
			/>,
		);
		const day = container.querySelector<HTMLElement>(
			"[data-service-day-index]",
		);
		expect(day).not.toBeNull();

		fireEvent.pointerDown(day as HTMLElement, {
			pointerId: 8,
			pointerType: "touch",
			clientX: 10,
			clientY: 10,
		});
		fireEvent.pointerUp(
			container.querySelector(".service-tracker-days") as HTMLElement,
			{
				pointerId: 8,
				pointerType: "touch",
				clientX: 10,
				clientY: 10,
			},
		);
		expect(
			document.querySelector('[data-service-day-tooltip="0"]'),
		).toBeInTheDocument();

		fireEvent.pointerDown(document.body);
		expect(document.querySelector("[data-service-day-tooltip]")).toBeNull();
	});
});

describe("SakuraServicePanel", () => {
	it("shows service and unmarked monitors while hiding network monitors", () => {
		const series = {
			current_up: 1,
			current_down: 0,
			total_up: 1,
			total_down: 0,
			delay: [12],
			up: [1],
			down: [0],
		};
		const serviceData: ServiceResponse = {
			success: true,
			data: {
				services: {
					"1": { ...series, service_name: "Edge Probe[network]" },
					"2": { ...series, service_name: "Public Site[service]" },
					"3": { ...series, service_name: "Legacy Service" },
				},
				cycle_transfer_stats: {},
			},
		};

		render(<SakuraServicePanel serviceData={serviceData} />);

		expect(screen.getByText("Public Site")).toBeInTheDocument();
		expect(screen.getByText("Legacy Service")).toBeInTheDocument();
		expect(screen.queryByText("Edge Probe")).not.toBeInTheDocument();
		expect(
			screen.queryByText(/\[(?:network|service)\]/i),
		).not.toBeInTheDocument();
	});
});
