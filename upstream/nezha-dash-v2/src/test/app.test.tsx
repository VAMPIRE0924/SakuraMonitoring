import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { createTestQueryClient } from "@/test/utils";

const appMocks = vi.hoisted(() => ({
	fetchSetting: vi.fn(),
	injectContext: vi.fn(),
	setTheme: vi.fn(),
}));

vi.mock("../sakura/SakuraDashboard", () => ({
	default: () => <div>sakura-dashboard-page</div>,
}));

vi.mock("../sakura/SakuraServerDetail", () => ({
	default: () => <div>sakura-server-detail-page</div>,
}));

vi.mock("../sakura/SakuraShell", () => ({
	SakuraRefreshToast: () => <div>refresh-toast</div>,
	SakuraShell: ({ children }: { children: React.ReactNode }) => (
		<div>
			<div>sakura-shell</div>
			{children}
		</div>
	),
}));

vi.mock("../hooks/use-theme", () => ({
	useTheme: () => ({ setTheme: appMocks.setTheme }),
}));

vi.mock("../lib/inject", () => ({
	InjectContext: appMocks.injectContext,
}));

vi.mock("../lib/nezha-api", () => ({
	fetchSetting: appMocks.fetchSetting,
}));

function settingResponse(customCode = "") {
	return {
		success: true,
		data: {
			config: {
				debug: false,
				language: "zh-CN",
				site_name: "Nezha",
				user_template: "",
				admin_template: "",
				custom_code: customCode,
			},
			version: "1.0.0",
		},
	};
}

function renderApp(
	route = "/",
	initialSetting?: ReturnType<typeof settingResponse>,
) {
	window.history.pushState({}, "", route);
	const queryClient = createTestQueryClient();
	if (initialSetting) queryClient.setQueryData(["setting"], initialSetting);

	return render(
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>,
	);
}

describe("App", () => {
	beforeEach(() => {
		appMocks.fetchSetting.mockResolvedValue(settingResponse());
		appMocks.injectContext.mockResolvedValue(undefined);
	});

	it("renders the main shell after settings load and applies global theme/background settings", async () => {
		Object.assign(window, {
			ForceTheme: "dark",
			CustomBackgroundImage: "/desktop.png",
			CustomMobileBackgroundImage: "/mobile.png",
		});

		const { container } = renderApp();

		expect(
			await screen.findByText("sakura-dashboard-page"),
		).toBeInTheDocument();
		expect(screen.getByText("refresh-toast")).toBeInTheDocument();
		expect(screen.getByText("sakura-shell")).toBeInTheDocument();
		expect(appMocks.setTheme).toHaveBeenCalledWith("dark");
		expect(
			Array.from(container.querySelectorAll<HTMLElement>("[style]")).some(
				(element) => element.style.backgroundImage.includes("/desktop.png"),
			),
		).toBe(true);
		expect(
			Array.from(container.querySelectorAll<HTMLElement>("[style]")).some(
				(element) => element.style.backgroundImage.includes("/mobile.png"),
			),
		).toBe(true);
	});

	it("shows the shared page loader while public settings are loading", async () => {
		let resolveSetting: (value: ReturnType<typeof settingResponse>) => void =
			() => undefined;
		appMocks.fetchSetting.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSetting = resolve;
				}),
		);

		const { container } = renderApp();

		expect(container.querySelector(".sakura-page-loader")).toBeInTheDocument();
		resolveSetting(settingResponse());
		expect(
			await screen.findByText("sakura-dashboard-page"),
		).toBeInTheDocument();
	});

	it("injects custom code before showing the app shell", async () => {
		appMocks.fetchSetting.mockResolvedValue(
			settingResponse("<script>custom</script>"),
		);

		renderApp();

		await waitFor(() => {
			expect(appMocks.injectContext).toHaveBeenCalledWith(
				"<script>custom</script>",
				expect.objectContaining({ beforeInject: expect.any(Function) }),
			);
		});
		expect(
			await screen.findByText("sakura-dashboard-page"),
		).toBeInTheDocument();
	});

	it("runs the injector for empty custom code so stale resources are cleaned", async () => {
		renderApp();

		await waitFor(() => {
			expect(appMocks.injectContext).toHaveBeenCalledWith(
				"",
				expect.objectContaining({ beforeInject: expect.any(Function) }),
			);
		});
		expect(
			await screen.findByText("sakura-dashboard-page"),
		).toBeInTheDocument();
	});

	it("renders from a guest setting response that omits optional fields", async () => {
		appMocks.fetchSetting.mockResolvedValue({
			success: true,
			data: {
				config: { language: "zh-CN", site_name: "Nezha" },
				tsdb_enabled: true,
			},
		});

		renderApp();

		await waitFor(() => {
			expect(appMocks.injectContext).toHaveBeenCalledWith(
				"",
				expect.objectContaining({ beforeInject: expect.any(Function) }),
			);
		});
		expect(
			await screen.findByText("sakura-dashboard-page"),
		).toBeInTheDocument();
	});

	it("renders fetch errors through the error page", async () => {
		appMocks.fetchSetting.mockRejectedValue(new Error("settings failed"));

		renderApp();

		expect(
			await screen.findByText("error.backendUnavailableDescription"),
		).toBeInTheDocument();
		expect(screen.queryByText("settings failed")).not.toBeInTheDocument();
	});

	it("keeps the last valid setting when a background refetch fails", async () => {
		appMocks.fetchSetting.mockRejectedValue(new Error("temporary failure"));

		renderApp("/", settingResponse());

		expect(
			await screen.findByText("sakura-dashboard-page"),
		).toBeInTheDocument();
		expect(
			screen.queryByText("error.backendUnavailableDescription"),
		).not.toBeInTheDocument();
	});

	it("routes server detail paths through the app router", async () => {
		renderApp("/server/42");

		expect(
			await screen.findByText("sakura-server-detail-page"),
		).toBeInTheDocument();
	});
});
