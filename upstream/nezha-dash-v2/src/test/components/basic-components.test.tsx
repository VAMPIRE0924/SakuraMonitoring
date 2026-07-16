import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/components/ErrorBoundary";
import ChartSkeleton from "@/components/loading/ChartSkeleton";
import { Loader } from "@/components/loading/Loader";
import { SakuraPageLoader } from "@/components/loading/SakuraPageLoader";
import { SakuraPanelLoader } from "@/components/loading/SakuraPanelLoader";
import NetworkChartLoading from "@/components/NetworkChartLoading";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

afterEach(() => vi.useRealTimers());

describe("active display components", () => {
	it("renders loading primitives", () => {
		const { container } = render(
			<>
				<ChartSkeleton width={120} height="40px" />
				<Loader visible={true} />
				<NetworkChartLoading />
			</>,
		);

		expect(
			container.querySelector('[style*="width: 120px"]'),
		).toBeInTheDocument();
		expect(container.querySelector(".hamster-loading-wrapper")).toHaveAttribute(
			"data-visible",
			"true",
		);
		expect(container.querySelectorAll(".hamster-loading-wrapper")).toHaveLength(
			2,
		);
	});

	it("renders the shared full-page Sakura loading state", () => {
		window.CustomLoadingIllustration = "/loading.gif";
		const { container } = render(<SakuraPageLoader label="正在刷新..." />);

		expect(container.querySelector(".sakura-page-loader")).toHaveAttribute(
			"aria-busy",
			"true",
		);
		expect(screen.getByText("正在刷新...")).toBeInTheDocument();
		expect(
			container.querySelector(".sakura-page-loader-illustration"),
		).toHaveAttribute("src", "/loading.gif");
	});

	it("recalculates one shared globe and service progress when resources change", () => {
		vi.useFakeTimers();
		const { container, rerender } = render(
			<SakuraPanelLoader
				label="Loading globe resources..."
				resources={["globe"]}
			/>,
		);
		act(() => vi.advanceTimersByTime(480));
		const progressbar = screen.getByRole("progressbar");
		const globeProgress = Number(progressbar.getAttribute("aria-valuenow"));

		rerender(
			<SakuraPanelLoader
				label="Loading globe and service resources..."
				resources={["globe", "service"]}
			/>,
		);
		const combinedProgress = Number(progressbar.getAttribute("aria-valuenow"));

		expect(container.querySelectorAll(".sakura-panel-loader")).toHaveLength(1);
		expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
		expect(container.querySelector(".sakura-panel-loader")).toHaveAttribute(
			"data-resources",
			"globe service",
		);
		expect(combinedProgress).toBe(Math.max(12, Math.floor(globeProgress / 2)));
		expect(
			container.querySelector(".sakura-page-loader"),
		).not.toBeInTheDocument();
		expect(
			container.querySelector(".sakura-panel-loader-illustration"),
		).not.toBeInTheDocument();
		expect(
			screen.getByText("Loading globe and service resources..."),
		).toBeInTheDocument();
	});

	it("catches render errors", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		function BrokenComponent(): never {
			throw new Error("boom");
		}

		render(
			<ErrorBoundary>
				<BrokenComponent />
			</ErrorBoundary>,
		);

		expect(screen.getByText("error.somethingWentWrong")).toBeInTheDocument();
		expect(screen.queryByText("boom")).not.toBeInTheDocument();
		vi.restoreAllMocks();
	});

	it("renders the retained skeleton and separator primitives", () => {
		const { container } = render(
			<>
				<Skeleton className="test-skeleton" />
				<Separator orientation="vertical" />
			</>,
		);

		expect(container.querySelector(".test-skeleton")).toBeInTheDocument();
		expect(
			container.querySelector('[data-orientation="vertical"]'),
		).toBeInTheDocument();
	});
});
