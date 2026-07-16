import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerDetailOverview from "@/components/ServerDetailOverview";
import { createServer } from "@/test/fixtures";

const websocketMocks = vi.hoisted(() => ({
	connected: true,
	lastData: null as {
		now: number;
		servers: ReturnType<typeof createServer>[];
	} | null,
}));

vi.mock("@/hooks/use-websocket-context", () => ({
	useWebSocketContext: () => websocketMocks,
}));

function seedWebSocketData({
	server = createServer(),
	now = Date.parse("2025-01-01T00:00:20.000Z"),
} = {}) {
	websocketMocks.connected = true;
	websocketMocks.lastData = { now, servers: [server] };
}

function LocationProbe() {
	const location = useLocation();
	return <p>{location.pathname}</p>;
}

describe("ServerDetailOverview", () => {
	beforeEach(() => {
		websocketMocks.connected = true;
		websocketMocks.lastData = null;
		Object.assign(window, {
			CustomBackgroundImage: "",
			ForceUseSvgFlag: true,
		});
	});

	it("shows the loading shell when websocket data is unavailable", () => {
		websocketMocks.connected = false;
		const { rerender } = render(
			<MemoryRouter>
				<ServerDetailOverview server_id="1" />
			</MemoryRouter>,
		);
		expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();

		seedWebSocketData();
		rerender(
			<MemoryRouter>
				<ServerDetailOverview server_id="404" />
			</MemoryRouter>,
		);
		expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
	});

	it("renders identity, hardware, traffic, city, and temperature details", async () => {
		const user = userEvent.setup();
		sessionStorage.setItem("fromMainPage", "true");
		seedWebSocketData({
			server: createServer({
				id: 7,
				name: "edge-detail",
				country_code: "us",
				public_note: JSON.stringify({
					planDataMod: { extra: "Los Angeles" },
				}),
				host: { gpu: ["NVIDIA T4"] },
				state: {
					temperatures: [{ Name: "CPU Core", Temperature: 55.5 }],
				},
			}),
		});

		const { unmount } = render(
			<MemoryRouter initialEntries={["/", "/server/7"]} initialIndex={1}>
				<ServerDetailOverview server_id="7" />
				<LocationProbe />
			</MemoryRouter>,
		);

		expect(screen.getByText("edge-detail")).toBeInTheDocument();
		expect(screen.getByText("serverDetail.online")).toBeInTheDocument();
		expect(screen.getByText("amd64")).toBeInTheDocument();
		expect(screen.getByText("Los Angeles")).toBeInTheDocument();
		expect(screen.getByText("serverDetail.city")).toBeInTheDocument();
		expect(screen.queryByText("United States")).not.toBeInTheDocument();
		expect(document.querySelector(".sakura-flag-image")).toBeNull();
		expect(screen.getByText(/linux - 6.8/)).toBeInTheDocument();
		expect(screen.getByText(/AMD EPYC/)).toBeInTheDocument();
		expect(screen.getByText("NVIDIA T4")).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: /serverDetail.temperature/ }),
		);
		expect(screen.getByText("CPU Core")).toBeInTheDocument();
		expect(screen.getByText(/55.50 °C/)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.getByText("/")).toBeInTheDocument();

		unmount();
		expect(sessionStorage.getItem("fromMainPage")).toBeNull();
	});

	it("uses the explicit Sakura overview material class", () => {
		seedWebSocketData({ server: createServer({ id: 7, name: "edge-detail" }) });
		const { container } = render(
			<MemoryRouter>
				<ServerDetailOverview server_id="7" />
			</MemoryRouter>,
		);

		expect(container.firstElementChild).toHaveClass("sakura-detail-overview");
	});
});
