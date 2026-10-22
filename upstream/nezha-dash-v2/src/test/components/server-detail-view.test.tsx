import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ServerDetailView from "@/components/ServerDetailView";

vi.mock("@/components/ServerDetailOverview", () => ({
	default: () => <p>overview</p>,
}));
vi.mock("@/components/ServerDetailChart", () => ({
	default: () => <p>metrics</p>,
}));
vi.mock("@/components/NetworkChart", () => ({
	NetworkChart: () => <p>network</p>,
}));
vi.mock("@/components/ServerDetailOnlineHistory", () => ({
	default: ({ server_id }: { server_id: string }) => <p>history {server_id}</p>,
}));

describe("Sakura shared server details", () => {
	it.each([
		false,
		true,
	])("provides all official detail tabs (embedded=%s)", async (embedded) => {
		render(<ServerDetailView embedded={embedded} serverId="7" />);
		const user = userEvent.setup();
		expect(screen.getAllByRole("tab")).toHaveLength(3);
		expect(screen.getByText("metrics")).toBeInTheDocument();
		await user.click(screen.getByRole("tab", { name: "tabSwitch.Online" }));
		expect(await screen.findByText("history 7")).toBeInTheDocument();
		await user.click(screen.getByRole("tab", { name: "tabSwitch.Network" }));
		expect(await screen.findByText("network")).toBeInTheDocument();
		await user.keyboard("{End}");
		expect(screen.getByRole("tab", { name: "tabSwitch.Online" })).toHaveFocus();
	});
});
