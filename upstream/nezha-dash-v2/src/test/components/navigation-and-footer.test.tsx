import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ServerDetailChartLoading,
	ServerDetailLoading,
} from "@/components/loading/ServerDetailLoading";
import TabSwitch from "@/components/TabSwitch";
import { createTestQueryClient } from "@/test/utils";

function LocationProbe() {
	const location = useLocation();
	return <p>{location.pathname}</p>;
}

describe("TabSwitch", () => {
	beforeEach(() => {
		Reflect.deleteProperty(window, "CustomBackgroundImage");
	});

	it("switches tabs and supports keyboard navigation", async () => {
		const user = userEvent.setup();
		const setCurrentTab = vi.fn();

		render(
			<TabSwitch
				tabs={["Detail", "Network"]}
				currentTab="Detail"
				setCurrentTab={setCurrentTab}
			/>,
		);
		expect(screen.getByRole("tablist")).toHaveAccessibleName(
			"Server detail views",
		);
		expect(
			screen.getByRole("tab", { name: "tabSwitch.Detail" }),
		).toHaveAttribute("aria-selected", "true");

		await user.click(screen.getByRole("tab", { name: "tabSwitch.Network" }));
		expect(setCurrentTab).toHaveBeenCalledWith("Network");

		setCurrentTab.mockClear();
		screen.getByRole("tab", { name: "tabSwitch.Detail" }).focus();
		await user.keyboard("{ArrowRight}");
		expect(setCurrentTab).toHaveBeenCalledWith("Network");
		expect(
			screen.getByRole("tab", { name: "tabSwitch.Network" }),
		).toHaveFocus();
	});

	it("uses sanitized Sakura background state for tab material", () => {
		const defaultTabs = render(
			<TabSwitch
				tabs={["Detail", "Network"]}
				currentTab="Detail"
				setCurrentTab={vi.fn()}
			/>,
		);
		expect(defaultTabs.container.querySelector('[role="tablist"]')).toHaveClass(
			"bg-stone-100/70",
		);
		defaultTabs.unmount();

		window.CustomBackgroundImage = "javascript:alert(1)";
		const unsafeTabs = render(
			<TabSwitch
				tabs={["Detail", "Network"]}
				currentTab="Detail"
				setCurrentTab={vi.fn()}
			/>,
		);
		expect(
			unsafeTabs.container.querySelector('[role="tablist"]'),
		).not.toHaveClass("bg-stone-100/70");
	});
});

describe("server detail loading states", () => {
	it("renders six chart skeleton cards", () => {
		const { container } = render(<ServerDetailChartLoading />);
		expect(container.querySelectorAll(".h-\\[182px\\]")).toHaveLength(6);
	});

	it("navigates home from the route loading affordance", async () => {
		const user = userEvent.setup();
		render(
			<QueryClientProvider client={createTestQueryClient()}>
				<MemoryRouter initialEntries={["/server/7"]}>
					<ServerDetailLoading />
					<LocationProbe />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.getByText("/")).toBeInTheDocument();
	});
});
