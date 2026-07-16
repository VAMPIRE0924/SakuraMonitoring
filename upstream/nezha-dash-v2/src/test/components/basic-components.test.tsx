import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/components/ErrorBoundary";
import ChartSkeleton from "@/components/loading/ChartSkeleton";
import { Loader } from "@/components/loading/Loader";
import { SakuraPageLoader } from "@/components/loading/SakuraPageLoader";
import NetworkChartLoading from "@/components/NetworkChartLoading";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

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
