import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SakuraPageLoader } from "@/components/loading/SakuraPageLoader";

describe("SakuraPageLoader", () => {
	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	it("advances toward the real loading stage instead of staying at 8%", () => {
		vi.useFakeTimers();
		render(<SakuraPageLoader targetProgress={36} />);

		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"8",
		);
		act(() => vi.advanceTimersByTime(200));
		expect(
			Number(screen.getByRole("progressbar").getAttribute("aria-valuenow")),
		).toBeGreaterThan(8);
		expect(
			Number(screen.getByRole("progressbar").getAttribute("aria-valuenow")),
		).toBeLessThanOrEqual(36);
	});

	it("keeps progress monotonic when the loader moves to the next stage", () => {
		vi.useFakeTimers();
		const view = render(<SakuraPageLoader targetProgress={36} />);
		act(() => vi.advanceTimersByTime(160));
		const firstStage = Number(
			screen.getByRole("progressbar").getAttribute("aria-valuenow"),
		);

		view.rerender(<SakuraPageLoader targetProgress={62} />);
		act(() => vi.advanceTimersByTime(160));
		expect(
			Number(screen.getByRole("progressbar").getAttribute("aria-valuenow")),
		).toBeGreaterThan(firstStage);
	});
});
