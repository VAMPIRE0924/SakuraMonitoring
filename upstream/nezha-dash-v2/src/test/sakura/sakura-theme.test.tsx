import { QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CommandProvider } from "@/context/command-provider";
import { SortProvider } from "@/context/sort-provider";
import { StatusProvider } from "@/context/status-provider";
import type { WebSocketConnectionState } from "@/context/websocket-context";
import { WebSocketContext } from "@/context/websocket-context";
import SakuraDashboard from "@/sakura/SakuraDashboard";
import SakuraServerDetail from "@/sakura/SakuraServerDetail";
import { SakuraRefreshToast, SakuraShell } from "@/sakura/SakuraShell";
import { createServer } from "@/test/fixtures";
import { createTestQueryClient } from "@/test/utils";
import type { NezhaServer, NezhaWebsocketResponse } from "@/types/nezha-api";

const apiMocks = vi.hoisted(() => ({
	fetchServerGroup: vi.fn(),
	fetchService: vi.fn(),
	fetchLoginUser: vi.fn(),
}));

vi.mock("@/lib/nezha-api", () => ({
	...apiMocks,
	isAuthenticatedProfile: (
		profile: { success: boolean; data: { id: number } } | undefined,
	) => profile?.success === true && profile.data.id > 0,
}));

vi.mock("@numeric-text/react", () => ({
	default: ({
		value,
		className,
	}: {
		value: string | number;
		className?: string;
	}) => <span className={className}>{value}</span>,
}));

vi.mock("@/sakura/SakuraMapPanel", () => ({
	default: ({
		now,
		serverList,
	}: {
		now: number;
		serverList: NezhaServer[];
	}) => (
		<section data-testid="sakura-global-map">
			<span>{now}</span>
			<span>{serverList.map((server) => server.name).join(",")}</span>
		</section>
	),
}));

vi.mock("@/components/ServerDetailChart", () => ({
	default: ({ server_id }: { server_id: string }) => (
		<section data-testid="sakura-detail-chart">
			detail chart {server_id}
		</section>
	),
}));

vi.mock("@/components/NetworkChart", () => ({
	NetworkChart: ({ server_id }: { server_id: number }) => (
		<section data-testid="sakura-network-chart">
			network chart {server_id}
		</section>
	),
}));

vi.mock("@/components/NetworkChartLoading", () => ({
	default: () => <span>network loading</span>,
}));

function LocationProbe() {
	const location = useLocation();
	return <p>{location.pathname}</p>;
}

function renderSakura(
	ui: React.ReactNode,
	route = "/",
	websocketData?: NezhaWebsocketResponse | null,
	connectionState: WebSocketConnectionState = "connected",
) {
	const now = Date.parse("2025-01-01T00:00:20.000Z");
	const servers = [
		createServer({ id: 1, name: "edge-online" }),
		createServer({
			id: 2,
			name: "edge-offline",
			last_active: "2024-12-31T23:00:00.000Z",
		}),
	];
	const lastData =
		websocketData === null
			? null
			: websocketData || { now, online: 1, servers };

	return render(
		<ThemeProvider>
			<QueryClientProvider client={createTestQueryClient()}>
				<WebSocketContext.Provider
					value={{
						connected: connectionState === "connected",
						connectionState,
						lastData,
						messageHistory: [],
						needReconnect: false,
						reconnect: vi.fn(),
						setNeedReconnect: vi.fn(),
					}}
				>
					<CommandProvider>
						<StatusProvider>
							<SortProvider>
								<MemoryRouter initialEntries={[route]}>
									{ui}
									<LocationProbe />
								</MemoryRouter>
							</SortProvider>
						</StatusProvider>
					</CommandProvider>
				</WebSocketContext.Provider>
			</QueryClientProvider>
		</ThemeProvider>,
	);
}

function renderSakuraShell() {
	return renderSakura(
		<SakuraShell>
			<span>shell-content</span>
		</SakuraShell>,
	);
}

function expectVisibleListServerName(container: HTMLElement, name: string) {
	expect(
		Array.from(
			container.querySelectorAll(
				".nz-list-row .sakura-list-identity-copy strong",
			),
		).some((node) => node.textContent === name),
	).toBe(true);
}

describe("Sakura independent theme", () => {
	it("distinguishes the initial WebSocket handshake from a real disconnection", () => {
		const connecting = renderSakura(
			<SakuraDashboard />,
			"/",
			null,
			"connecting",
		);
		expect(document.querySelector(".sakura-page-loader")).toBeInTheDocument();
		expect(
			screen.queryByText("info.websocketConnecting"),
		).not.toBeInTheDocument();
		connecting.unmount();

		renderSakura(<SakuraDashboard />, "/", null, "disconnected");
		expect(screen.getByText("info.websocketDisconnected")).toBeInTheDocument();
	});
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		for (const key of [
			"CustomBackgroundImage",
			"CustomMobileBackgroundImage",
			"CustomTitle",
			"CustomSiteName",
			"CustomLogo",
			"CustomFavicon",
			"CustomDesc",
			"CustomLinks",
			"CustomIllustration",
			"CustomLoadingIllustration",
			"CustomFooterPowered",
			"ShowNetTransfer",
			"FixedTopServerName",
			"ForceUseSvgFlag",
			"DisableAnimatedMan",
			"ForceTheme",
			"ForceShowServices",
			"ForceCardInline",
			"ForceShowMap",
			"ForcePeakCutEnabled",
			"ForceSortType",
			"ForceSortOrder",
		]) {
			Reflect.deleteProperty(window, key);
		}
		apiMocks.fetchServerGroup.mockResolvedValue({
			success: true,
			data: [
				{
					group: {
						id: 1,
						created_at: "",
						updated_at: "",
						name: "Edge",
					},
					servers: [1],
				},
			],
		});
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {
					"1": {
						service_name: "HTTPS",
						current_up: 1,
						current_down: 24,
						total_up: 10,
						total_down: 0,
						delay: [24],
						up: [1],
						down: [0],
					},
				},
				cycle_transfer_stats: {},
			},
		});
		apiMocks.fetchLoginUser.mockRejectedValue(new Error("anonymous"));
	});

	it("shows the Sakura reconnect toast and clears its stale session marker", () => {
		vi.useFakeTimers();
		sessionStorage.setItem("needRefresh", "true");
		const reconnect = vi.fn();
		const setNeedReconnect = vi.fn();
		const view = render(
			<WebSocketContext.Provider
				value={{
					connected: false,
					connectionState: "disconnected",
					lastData: null,
					messageHistory: [],
					needReconnect: true,
					reconnect,
					setNeedReconnect,
				}}
			>
				<MemoryRouter>
					<SakuraRefreshToast />
				</MemoryRouter>
			</WebSocketContext.Provider>,
		);

		expect(screen.getByText("refreshing...")).toBeInTheDocument();
		expect(sessionStorage.getItem("needRefresh")).toBeNull();
		expect(reconnect).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1000);
		expect(setNeedReconnect).toHaveBeenCalledWith(false);
		view.unmount();
	});

	it("renders built-in Sakura brand assets until custom config overrides them", async () => {
		const { container, unmount } = renderSakuraShell();

		expect(screen.getByText("shell-content")).toBeInTheDocument();
		expect(container.querySelector(".sakura-brand-logo")).toHaveAttribute(
			"src",
			"/sakura-assets/sakura-mark.png",
		);
		expect(container.querySelector(".sakura-footer")).toHaveTextContent(
			"Powered by VAMPIRE",
		);
		expect(screen.queryByText("Nezha")).not.toBeInTheDocument();
		expect(screen.getByText("Sakura Monitoring")).toBeInTheDocument();
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Search")).toBeInTheDocument();
		expect(screen.getByLabelText("Change language")).toBeInTheDocument();
		expect(screen.getByLabelText("Toggle theme")).toBeInTheDocument();
		expect(screen.getByLabelText("Hide background")).toBeInTheDocument();
		expect(screen.getByText("樱花探针")).toBeInTheDocument();
		await waitFor(() => expect(document.title).toBe("Sakura Monitoring"));
		const defaultIcon =
			document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
		expect(defaultIcon).toHaveAttribute(
			"href",
			"/sakura-assets/sakura-mark.png",
		);
		expect(defaultIcon).not.toHaveAttribute("type");

		unmount();

		Object.assign(window, {
			CustomTitle: "Sakura Monitoring",
			CustomDesc: "樱花探针",
			CustomLogo: "/sakura-logo.svg",
			CustomFavicon: "/favicon.ico",
			CustomLinks:
				'[{"name":"Docs","link":"https://example.test"},{"name":"Bad","link":"javascript:alert(1)"}]',
			CustomFooterPowered: {
				show: true,
				prefix: "Powered by",
				name: "VAMPIRE",
				url: "https://example.test",
			},
		});

		const custom = renderSakuraShell();

		expect(await screen.findByText("Sakura Monitoring")).toBeInTheDocument();
		expect(screen.getByText("樱花探针")).toBeInTheDocument();
		expect(
			custom.container.querySelector(".sakura-brand-logo"),
		).toHaveAttribute("src", "/sakura-logo.svg");
		for (const link of screen.getAllByText("Docs")) {
			expect(link).toHaveAttribute("href", "https://example.test");
		}
		expect(screen.queryByText("Bad")).not.toBeInTheDocument();
		expect(custom.container.querySelector(".sakura-footer")).toHaveTextContent(
			"Powered by VAMPIRE",
		);
		await waitFor(() => expect(document.title).toBe("Sakura Monitoring"));
		const customIcon = document.querySelector('link[rel*="icon"]');
		expect(customIcon).toHaveAttribute("href", "/favicon.ico");
		expect(customIcon).not.toHaveAttribute("type");
	});

	it("does not fall back to Nezha assets when public asset config is unsafe", async () => {
		Object.assign(window, {
			CustomTitle: "",
			CustomDesc: "",
			CustomLogo: "javascript:alert(1)",
			CustomFavicon: "data:text/html,<script>alert(1)</script>",
			CustomIllustration: 'https://example.test/illu.webp"',
			CustomFooterPowered: {
				show: true,
				prefix: "Powered by",
				name: "VAMPIRE",
				url: "javascript:alert(1)",
			},
		});

		const { container } = renderSakuraShell();

		expect(screen.getByText("shell-content")).toBeInTheDocument();
		expect(
			container.querySelector(".sakura-brand-logo"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("Nezha")).not.toBeInTheDocument();
		expect(container.querySelector(".sakura-footer a")).not.toBeInTheDocument();
		expect(container.querySelector(".sakura-footer")).toHaveTextContent(
			"Powered by VAMPIRE",
		);
		await waitFor(() => expect(document.title).toBe(""));
		expect(document.querySelector('link[rel*="icon"]')).toHaveAttribute(
			"href",
			expect.stringContaining("data:image/svg+xml"),
		);
		expect(document.querySelector('link[rel*="icon"]')).toHaveAttribute(
			"type",
			"image/svg+xml",
		);
	});

	it("lets configuration-only custom code clear built-in public identity", async () => {
		Object.assign(window, {
			CustomBackgroundImage: "",
			CustomMobileBackgroundImage: "",
			CustomTitle: "",
			CustomLogo: "",
			CustomFavicon: "",
			CustomDesc: "",
			CustomIllustration: "",
			CustomFooterPowered: {
				show: false,
				prefix: "",
				name: "",
				url: "",
			},
		});

		const { container } = renderSakuraShell();

		expect(screen.getByText("shell-content")).toBeInTheDocument();
		expect(
			container.querySelector(".sakura-brand-logo"),
		).not.toBeInTheDocument();
		expect(
			container.querySelector(".sakura-brand-text"),
		).not.toBeInTheDocument();
		expect(container.querySelector(".sakura-footer")).not.toBeInTheDocument();
		expect(screen.queryByText("Sakura Monitoring")).not.toBeInTheDocument();
		expect(screen.queryByText("Hide background")).not.toBeInTheDocument();
		expect(screen.queryByText("樱花探针")).not.toBeInTheDocument();
		await waitFor(() => expect(document.title).toBe(""));
		expect(document.querySelector('link[rel*="icon"]')).toHaveAttribute(
			"href",
			expect.stringContaining("data:image/svg+xml"),
		);
	});

	it("keeps logo and favicon configuration independent", async () => {
		Object.assign(window, {
			CustomLogo: "/sakura-logo.svg",
		});

		const { container } = renderSakuraShell();

		expect(container.querySelector(".sakura-brand-logo")).toHaveAttribute(
			"src",
			"/sakura-logo.svg",
		);
		await waitFor(() => expect(document.title).toBe("Sakura Monitoring"));
		expect(document.querySelector('link[rel*="icon"]')).toHaveAttribute(
			"href",
			"/sakura-assets/sakura-mark.png",
		);
	});

	it("uses CustomDesc as the primary visible brand when CustomTitle is blank", async () => {
		Object.assign(window, {
			CustomTitle: "",
			CustomDesc: "Sakura Probe",
		});

		const { container } = renderSakuraShell();

		const brandTitle = container.querySelector(".sakura-brand-text strong");
		const brandDescription = container.querySelector(".sakura-brand-text span");

		expect(brandTitle).toHaveTextContent("Sakura Probe");
		expect(brandDescription).not.toBeInTheDocument();
		await waitFor(() => expect(document.title).toBe(""));
	});

	it("shows the WAF login decoy anonymously and dashboard after login", async () => {
		const profileRequestCount = apiMocks.fetchLoginUser.mock.calls.length;
		const anonymous = renderSakuraShell();

		expect(screen.getByText("shell-content")).toBeInTheDocument();
		await waitFor(() =>
			expect(apiMocks.fetchLoginUser).toHaveBeenCalledTimes(
				profileRequestCount + 1,
			),
		);
		const anonymousLinks =
			anonymous.container.querySelectorAll(".sakura-auth-link");
		expect(anonymousLinks).toHaveLength(2);
		for (const link of anonymousLinks) {
			expect(link).toHaveAttribute("href", "/dashboard/login");
			expect(link).toHaveTextContent("login");
		}
		expect(
			anonymous.container.querySelector(".sakura-online-pill"),
		).toHaveAttribute("aria-label", "1 online");
		anonymous.unmount();

		apiMocks.fetchLoginUser.mockResolvedValue({
			success: true,
			data: {
				id: 1,
				name: "admin",
			},
		});
		Object.defineProperty(document, "cookie", {
			configurable: true,
			value: "",
		});

		const loggedIn = renderSakuraShell();

		await waitFor(() => {
			const links = loggedIn.container.querySelectorAll(".sakura-auth-link");
			expect(links).toHaveLength(2);
			for (const link of links) {
				expect(link).toHaveAttribute("href", "/dashboard");
			}
		});
		const dashboardLinks =
			loggedIn.container.querySelectorAll(".sakura-auth-link");
		expect(dashboardLinks).toHaveLength(2);
		for (const link of dashboardLinks) {
			expect(link).toHaveAttribute("href", "/dashboard");
			expect(link).toHaveTextContent("dashboard");
		}
	});

	it("distinguishes the initial websocket handshake from an offline state", () => {
		const connecting = renderSakura(
			<SakuraShell>
				<span>shell-content</span>
			</SakuraShell>,
			"/",
			null,
			"connecting",
		);
		const connectingPill = connecting.container.querySelector(
			".sakura-online-pill",
		);
		expect(connectingPill).toHaveAttribute("aria-label", "connecting");
		expect(connectingPill).toHaveTextContent("connecting");
		expect(connectingPill).not.toHaveTextContent("...");
		connecting.unmount();

		const disconnected = renderSakura(
			<SakuraShell>
				<span>shell-content</span>
			</SakuraShell>,
			"/",
			null,
			"disconnected",
		);
		const disconnectedPill = disconnected.container.querySelector(
			".sakura-online-pill",
		);
		expect(disconnectedPill).toHaveAttribute("aria-label", "offline");
		expect(disconnectedPill).toHaveTextContent("offline");
		expect(disconnectedPill).not.toHaveTextContent("...");
	});

	it("does not trust a profile id when the API marks the response unsuccessful", async () => {
		apiMocks.fetchLoginUser.mockResolvedValue({
			success: false,
			data: { id: 1 },
		});

		const { container } = renderSakuraShell();

		await waitFor(() => expect(apiMocks.fetchLoginUser).toHaveBeenCalled());
		expect(container.querySelectorAll(".sakura-auth-link")).toHaveLength(2);
		for (const link of container.querySelectorAll(".sakura-auth-link")) {
			expect(link).toHaveAttribute("href", "/dashboard/login");
		}
	});

	it("keeps the Sakura language menu limited to the six supported locales", async () => {
		renderSakuraShell();

		fireEvent.pointerDown(screen.getByLabelText("Change language"));

		expect(await screen.findByText("language.zh-CN")).toBeInTheDocument();
		expect(screen.getByText("language.zh-TW")).toBeInTheDocument();
		expect(screen.getByText("language.en-US")).toBeInTheDocument();
		expect(screen.getByText("language.ru-RU")).toBeInTheDocument();
		expect(screen.getByText("language.es-ES")).toBeInTheDocument();
		expect(screen.getByText("language.de-DE")).toBeInTheDocument();
		expect(screen.queryByText("language.ta-IN")).not.toBeInTheDocument();

		fireEvent.click(screen.getByText("language.de-DE"));
		await waitFor(() =>
			expect(screen.queryByText("language.zh-CN")).not.toBeInTheDocument(),
		);
	});

	it("closes the Sakura theme menu after selecting a theme", async () => {
		renderSakuraShell();

		fireEvent.pointerDown(screen.getByLabelText("Toggle theme"));
		fireEvent.click(await screen.findByText("theme.dark"));

		await waitFor(() =>
			expect(screen.queryByText("theme.light")).not.toBeInTheDocument(),
		);
	});

	it("renders Sakura dashboard metrics and server tiles without default page components", async () => {
		const { container } = renderSakura(<SakuraDashboard />);

		expect(
			screen.getByText(/greeting\.(morning|noon|afternoon|evening)/),
		).toBeInTheDocument();
		expect(screen.getByText("whereTheTimeIs")).toBeInTheDocument();
		expect(container.querySelector(".sakura-clock-digits")).toHaveProperty(
			"tagName",
			"TIME",
		);
		expect(
			container.querySelector("[data-issues-count-animation]"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("Sakura Monitoring")).not.toBeInTheDocument();
		expect(screen.getByText("serverOverview.totalServers")).toBeInTheDocument();
		expect(
			screen.getByText("serverOverview.onlineServers"),
		).toBeInTheDocument();
		expect(
			screen.getByText("serverOverview.offlineServers"),
		).toBeInTheDocument();
		expect(
			screen.getByText("serverOverview.totalUploadCard"),
		).toBeInTheDocument();
		expect(
			screen.getByText("serverOverview.totalDownloadCard"),
		).toBeInTheDocument();
		expect(container.querySelectorAll(".nz-overview-basic-card")).toHaveLength(
			3,
		);
		expect(container.querySelector(".nz-overview-up-card")).toHaveTextContent(
			"serverOverview.trafficRate",
		);
		expect(container.querySelector(".nz-overview-up-card")).toHaveTextContent(
			"serverOverview.trafficTotal",
		);
		expect(container.querySelector(".nz-overview-down-card")).toHaveTextContent(
			"serverOverview.trafficRate",
		);
		expect(screen.getByText("edge-online")).toBeInTheDocument();
		expect(screen.getByText("edge-offline")).toBeInTheDocument();
		expect(container.querySelector(".server-overview")).toBeInTheDocument();
		expect(container.querySelector(".sakura-dashboard")).toBeInTheDocument();

		await waitFor(() => {
			expect(screen.getByText("Edge")).toBeInTheDocument();
		});
	});

	it("keeps the nine list metric slots for offline servers", async () => {
		localStorage.setItem("inline", "1");
		const { container } = renderSakura(<SakuraDashboard />);

		expectVisibleListServerName(container, "edge-offline");
		const offlineRow = container.querySelector(".nz-list-row.offline");
		expect(offlineRow).toBeInTheDocument();
		const offlineMetrics = offlineRow?.querySelector(".sakura-list-metrics");
		expect(offlineMetrics).toBeInTheDocument();
		expect(
			offlineMetrics?.querySelectorAll(
				".sakura-list-system, .sakura-list-metric",
			),
		).toHaveLength(9);
		expect(offlineMetrics?.textContent?.match(/N\/A/g)).toHaveLength(7);
		expect(offlineRow?.querySelector(".sakura-list-billing-line")).toBeNull();
		expect(container.querySelector(".sakura-list-title-measure")).toBeNull();
		expect(offlineRow?.querySelector(".sakura-list-days-line")).toBeNull();
		expect(offlineRow).toHaveTextContent("Linux");
	});

	it("moves list billing rows up when optional title content is absent", () => {
		localStorage.setItem("inline", "1");
		const billingNote = (amount: string, withDates: boolean) =>
			JSON.stringify({
				billingDataMod: {
					amount,
					cycle: "mo",
					endDate: withDates ? "0000-00-00" : "",
					startDate: withDates ? "2025-01-01" : "",
				},
			});
		const servers = [
			createServer({
				id: 11,
				name: "price-and-remaining",
				public_note: billingNote("4", true),
			}),
			createServer({
				id: 12,
				name: "remaining-only",
				public_note: billingNote("", true),
			}),
			createServer({
				id: 13,
				name: "price-only",
				public_note: billingNote("4", false),
			}),
			createServer({ id: 14, name: "name-only", public_note: "" }),
			createServer({
				id: 15,
				name: "remaining-with-bar",
				public_note: JSON.stringify({
					billingDataMod: {
						amount: "",
						cycle: "mo",
						endDate: "2099-12-31",
						startDate: "2025-01-01",
					},
				}),
			}),
			createServer({
				id: 16,
				name: "expired-without-bar",
				public_note: JSON.stringify({
					billingDataMod: {
						amount: "4",
						cycle: "mo",
						endDate: "2024-12-31",
						startDate: "2024-01-01",
					},
				}),
			}),
		];
		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now: Date.parse("2025-01-01T00:00:20.000Z"),
			online: servers.length,
			servers,
		});
		const titleChildren = (name: string) => {
			const title = Array.from(
				container.querySelectorAll<HTMLElement>(".sakura-list-identity-copy"),
			).find((item) => item.querySelector("strong")?.textContent === name);
			return Array.from(title?.children ?? []).map(
				(item) => item.className || item.tagName.toLowerCase(),
			);
		};
		expect(titleChildren("price-and-remaining")).toEqual([
			"strong",
			"sakura-list-billing-line",
			"sakura-list-days-line",
		]);
		expect(titleChildren("remaining-only")).toEqual([
			"strong",
			"sakura-list-days-line",
		]);
		expect(titleChildren("price-only")).toEqual([
			"strong",
			"sakura-list-billing-line",
		]);
		expect(titleChildren("name-only")).toEqual(["strong"]);
		expect(titleChildren("remaining-with-bar")).toEqual([
			"strong",
			"sakura-list-days-line",
			"sakura-list-expire-bar",
		]);
		expect(titleChildren("expired-without-bar")).toEqual([
			"strong",
			"sakura-list-billing-line",
			"sakura-list-days-line danger",
		]);
	});

	it("omits the remaining progress bar from expired server cards", () => {
		const expired = createServer({
			id: 16,
			name: "expired-card",
			public_note: JSON.stringify({
				billingDataMod: {
					amount: "4",
					cycle: "mo",
					endDate: "2024-12-31",
					startDate: "2024-01-01",
				},
			}),
		});
		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now: Date.parse("2025-01-01T00:00:20.000Z"),
			online: 1,
			servers: [expired],
		});
		const card = container.querySelector(".nz-card-row");

		expect(card).toHaveTextContent("billingInfo.price: 4/mo");
		expect(card?.textContent).toMatch(
			/billingInfo\.expired: \d+ billingInfo\.days/,
		);
		expect(card?.querySelector(".sakura-billing-bar")).toBeNull();
	});

	it("keeps list upload and download metrics text-only", async () => {
		localStorage.setItem("inline", "1");
		const { container } = renderSakura(<SakuraDashboard />);

		expectVisibleListServerName(container, "edge-online");
		const onlineMetrics = Array.from(
			container.querySelectorAll(
				".nz-list-row:not(.offline) .sakura-list-metrics .sakura-list-metric",
			),
		);
		expect(
			container.querySelector(".sakura-list-separator"),
		).toBeInTheDocument();
		const transferMetrics = onlineMetrics.filter((metric) =>
			["serverCard.upload", "serverCard.download"].some((label) =>
				metric.textContent?.includes(label),
			),
		);

		expect(transferMetrics).toHaveLength(2);
		for (const metric of transferMetrics) {
			expect(metric.querySelector("svg")).not.toBeInTheDocument();
		}
	});

	it("keeps default server ordering independent of the descending sort direction", async () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 2,
			servers: [
				createServer({
					id: 1,
					name: "Router",
					state: { net_out_speed: 1 },
				}),
				createServer({
					id: 2,
					name: "EU-PL-01",
					state: { net_out_speed: 999 },
				}),
				createServer({
					id: 3,
					name: "Offline",
					last_active: "2024-12-31T23:00:00.000Z",
					state: { net_out_speed: 0 },
				}),
			],
		});

		expect(await screen.findByText("Router")).toBeInTheDocument();
		const cardNames = Array.from(
			container.querySelectorAll(".nz-card-row .sakura-card-title-name"),
		).map((node) => node.textContent);

		expect(cardNames.slice(0, 3)).toEqual(["Router", "EU-PL-01", "Offline"]);
	});

	it("applies ShowNetTransfer consistently in card and list modes", async () => {
		window.ShowNetTransfer = true;
		const card = renderSakura(<SakuraDashboard />);

		expect(await screen.findByText("edge-online")).toBeInTheDocument();
		expect(
			card.container.querySelector(
				".sakura-card-network > .sakura-card-transfer-value",
			),
		).toBeInTheDocument();
		card.unmount();

		window.ShowNetTransfer = false;
		const cardHidden = renderSakura(<SakuraDashboard />);

		expect(await screen.findByText("edge-online")).toBeInTheDocument();
		expect(
			cardHidden.container.querySelector(
				".sakura-card-network > .sakura-card-transfer-value",
			),
		).not.toBeInTheDocument();
		cardHidden.unmount();

		localStorage.setItem("inline", "1");
		const listHidden = renderSakura(<SakuraDashboard />);

		expectVisibleListServerName(listHidden.container, "edge-online");
		const listText = String(
			listHidden.container.querySelector(".sakura-list-metrics")?.textContent ||
				"",
		);
		expect(listText).not.toContain("serverCard.totalUpload");
		expect(listText).not.toContain("serverCard.totalDownload");
	});

	it("applies FixedTopServerName to the Sakura card layout", async () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			id: 1,
			name: "edge-online",
			public_note: JSON.stringify({
				billingDataMod: {
					amount: "4",
					cycle: "mo",
					endDate: "0000-00-00",
					startDate: "2025-01-01",
				},
			}),
		});
		const websocketData = { now, online: 1, servers: [server] };
		const fixed = renderSakura(<SakuraDashboard />, "/", websocketData);

		expect(await screen.findByText("edge-online")).toBeInTheDocument();
		expect(
			fixed.container.querySelector(".sakura-server-head-fixed"),
		).toBeInTheDocument();
		expect(
			fixed.container.querySelector(
				".sakura-server-head .sakura-title-billing",
			),
		).not.toBeInTheDocument();
		fixed.unmount();

		window.FixedTopServerName = false;
		const loose = renderSakura(<SakuraDashboard />, "/", websocketData);

		expect(await screen.findByText("edge-online")).toBeInTheDocument();
		expect(
			loose.container.querySelector(".sakura-server-head-fixed"),
		).not.toBeInTheDocument();
		expect(
			loose.container.querySelector(
				".sakura-server-head .sakura-title-billing",
			),
		).toHaveTextContent("billingInfo.price: 4/mo");
	});

	it("passes ForceUseSvgFlag through Sakura card and list flags", async () => {
		window.ForceUseSvgFlag = true;
		const card = renderSakura(<SakuraDashboard />);

		expect(await screen.findByText("edge-online")).toBeInTheDocument();
		await waitFor(() =>
			expect(
				card.container.querySelector(".nz-card-row .sakura-flag-image"),
			).toBeInTheDocument(),
		);
		card.unmount();

		window.ForceUseSvgFlag = false;
		const originalCreateElement = document.createElement.bind(document);
		const canvasContext = {
			fillStyle: "",
			textBaseline: "",
			font: "",
			fillText: vi.fn(),
			getImageData: vi.fn(() => ({
				data: new Uint8ClampedArray([0, 0, 0, 255]),
			})),
			measureText: vi.fn(() => ({ width: 100 })),
		} as unknown as CanvasRenderingContext2D;
		vi.spyOn(document, "createElement").mockImplementation(
			(tagName, options) => {
				if (tagName === "canvas") {
					return {
						getContext: vi.fn(() => canvasContext),
					} as unknown as HTMLCanvasElement;
				}

				return originalCreateElement(tagName, options);
			},
		);
		localStorage.setItem("inline", "1");
		const list = renderSakura(<SakuraDashboard />);

		expectVisibleListServerName(list.container, "edge-online");
		await waitFor(() =>
			expect(
				list.container.querySelector(".sakura-server-list .sakura-flag-image"),
			).not.toBeInTheDocument(),
		);
	});

	it("sorts Sakura cards with official raw server state fields", async () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 2,
			servers: [
				createServer({
					id: 1,
					name: "cpu-low",
					state: { cpu: 3 },
				}),
				createServer({
					id: 2,
					name: "cpu-high",
					state: { cpu: 88 },
				}),
			],
		});

		expect(await screen.findByText("cpu-low")).toBeInTheDocument();
		fireEvent.click(screen.getByText("sort.label"));
		fireEvent.click(
			screen.getByRole("menuitemradio", { name: "sort.types.cpu" }),
		);

		const cardNames = Array.from(
			container.querySelectorAll(".nz-card-row .sakura-card-title-name"),
		).map((node) => node.textContent);

		expect(cardNames.slice(0, 2)).toEqual(["cpu-high", "cpu-low"]);
	});

	it("renders card-mode CPU cores and capacity pairs from official server data", async () => {
		Object.assign(window, {
			ForceUseSvgFlag: true,
		});
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			name: "resource-rich",
			host: {
				cpu: ["4 cores"],
				disk_total: 256 * 1024 ** 3,
				mem_total: 16 * 1024 ** 3,
				platform: "linux",
				platform_version: "Debian GNU/Linux 12 (bookworm)",
			},
			state: {
				disk_used: 64 * 1024 ** 3,
				mem_used: 8 * 1024 ** 3,
			},
		});

		renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [server],
		});

		expect(await screen.findByText("resource-rich")).toBeInTheDocument();
		expect(screen.getByText("4 cores")).toBeInTheDocument();
		expect(screen.getByText("8 / 16 GiB")).toBeInTheDocument();
		expect(screen.getByText("64 / 256 GiB")).toBeInTheDocument();
		expect(screen.getAllByText("Debian").length).toBeGreaterThanOrEqual(1);
		await waitFor(() =>
			expect(
				document.querySelector(".sakura-server-head .sakura-flag-image"),
			).toBeInTheDocument(),
		);
	});

	it("keeps card and list resource percentages at live-theme precision", async () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			name: "precision-host",
			state: {
				cpu: 12.345,
				disk_used: 100,
				mem_used: 50,
			},
		});
		const websocketData = { now, online: 1, servers: [server] };

		const card = renderSakura(<SakuraDashboard />, "/", websocketData);
		expect(await screen.findByText("precision-host")).toBeInTheDocument();
		expect(
			Array.from(
				card.container.querySelectorAll(".sakura-gauge-ring strong"),
			).map((node) => node.textContent),
		).toEqual(["12.35%", "25.00%", "25.00%"]);
		const cardRings = Array.from(
			card.container.querySelectorAll<HTMLElement>(".sakura-gauge-ring"),
		);
		expect(cardRings[0]).toHaveAttribute("role", "progressbar");
		expect(cardRings[0]).toHaveAttribute("aria-valuenow", "12.35");
		expect(cardRings[0].style.getPropertyValue("--nz-ring-color")).toBe(
			"hsl(127.10 72% 50%)",
		);
		expect(cardRings[1].style.getPropertyValue("--nz-ring-color")).toBe(
			"hsl(108.75 72% 50%)",
		);
		card.unmount();

		localStorage.setItem("inline", "1");
		const list = renderSakura(<SakuraDashboard />, "/", websocketData);
		expectVisibleListServerName(list.container, "precision-host");
		expect(
			list.container.querySelector(".sakura-list-metrics"),
		).toHaveTextContent("12.35%");
		expect(
			list.container.querySelector(".sakura-list-metrics"),
		).toHaveTextContent("25.00%");
	});

	it("extracts physical CPU core counts from live agent strings", async () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			name: "physical-core-host",
			host: {
				cpu: ["Intel Xeon 12 Physical Core"],
			},
		});

		renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [server],
		});

		expect(await screen.findByText("physical-core-host")).toBeInTheDocument();
		expect(screen.getByText("12 cores")).toBeInTheDocument();
	});

	it("keeps server cards rendering when live host CPU info is missing", async () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			name: "missing-cpu-info",
			host: {
				cpu: undefined,
			},
		});
		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [server],
		});

		expect(await screen.findByText("missing-cpu-info")).toBeInTheDocument();
		expect(container.querySelector(".sakura-server-metrics")).toHaveTextContent(
			"N/A",
		);
	});

	it("renders default or configured illustration only when it is not disabled", async () => {
		const defaultIllustration = renderSakura(<SakuraDashboard />);

		await waitFor(() =>
			expect(
				defaultIllustration.container.querySelector(
					".nz-overview-illustration",
				),
			).toHaveAttribute("src", "/sakura-assets/sakura-illustration.webp"),
		);
		defaultIllustration.unmount();

		Object.assign(window, {
			CustomIllustration: "/sakura-illustration.webp",
			DisableAnimatedMan: false,
		});

		const visible = renderSakura(<SakuraDashboard />);

		await waitFor(() =>
			expect(
				visible.container.querySelector(".nz-overview-illustration"),
			).toHaveAttribute("src", "/sakura-illustration.webp"),
		);
		visible.unmount();

		Object.assign(window, {
			CustomIllustration: "/sakura-illustration.webp",
			DisableAnimatedMan: true,
		});

		const hidden = renderSakura(<SakuraDashboard />);

		expect(
			hidden.container.querySelector(".nz-overview-illustration"),
		).not.toBeInTheDocument();
		hidden.unmount();

		Object.assign(window, {
			CustomIllustration: "",
			DisableAnimatedMan: false,
		});

		const cleared = renderSakura(<SakuraDashboard />);

		expect(
			cleared.container.querySelector(".nz-overview-illustration"),
		).not.toBeInTheDocument();
	});

	it("keeps cycle transfer on server cards without turning it into service panel cards", async () => {
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {},
				cycle_transfer_stats: {
					monthly: {
						name: "Monthly",
						from: "2026-07-01T00:00:00.000Z",
						to: "2026-08-01T00:00:00.000Z",
						max: -1,
						min: 0,
						server_name: {
							"1": "edge-online",
							"2": "edge-offline",
						},
						transfer: {
							"1": 1024 ** 3,
							"2": 2 * 1024 ** 3,
						},
						next_update: {
							"1": "2026-08-01T00:00:00.000Z",
							"2": "2026-08-01T00:00:00.000Z",
						},
					},
				},
			},
		});

		const { container } = renderSakura(<SakuraDashboard />);

		await waitFor(() =>
			expect(container.querySelectorAll(".sakura-cycle-block")).toHaveLength(2),
		);
		expect(
			container.querySelector(
				".sakura-server-tile.offline .sakura-cycle-block",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Toggle service panel"),
		).not.toBeInTheDocument();
		expect(
			container.querySelector(".sakura-cycle-card"),
		).not.toBeInTheDocument();
	});

	it("filters status, toggles service panel, and opens Sakura detail dialog", async () => {
		renderSakura(<SakuraDashboard />);

		fireEvent.click(screen.getByText("serverOverview.onlineServers"));
		expect(screen.getByText("edge-online")).toBeInTheDocument();
		expect(screen.queryByText("edge-offline")).not.toBeInTheDocument();

		fireEvent.click(screen.getByLabelText("Toggle map panel"));
		expect(await screen.findByTestId("sakura-global-map")).toHaveTextContent(
			"edge-online,edge-offline",
		);

		fireEvent.click(await screen.findByLabelText("Toggle service panel"));
		expect(await screen.findByText("HTTPS")).toBeInTheDocument();
		const serviceCard = document.querySelector(".sakura-service-card");
		expect(serviceCard).toHaveTextContent("HTTPS");
		expect(serviceCard).toHaveTextContent("24ms");
		expect(
			document.querySelector(".sakura-service-current"),
		).not.toBeInTheDocument();

		fireEvent.click(screen.getByText("edge-online"));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		const closeButton = screen.getByRole("button", { name: "Close" });
		expect(closeButton).toHaveClass("sakura-dialog-close");
		expect(screen.getByTestId("sakura-detail-chart")).toHaveTextContent(
			"detail chart 1",
		);
		expect(screen.getByText("/")).toBeInTheDocument();
		fireEvent.click(closeButton);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("hides the service toolbar button when every service is network-only", async () => {
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {
					network: {
						service_name: "Edge Probe[network]",
						current_up: 1,
						current_down: 0,
						total_up: 10,
						total_down: 0,
						delay: [24],
						up: [1],
						down: [0],
					},
				},
				cycle_transfer_stats: {},
			},
		});

		renderSakura(<SakuraDashboard />);

		await waitFor(() => expect(apiMocks.fetchService).toHaveBeenCalled());
		expect(
			screen.queryByLabelText("Toggle service panel"),
		).not.toBeInTheDocument();
	});

	it("marks service uptime and delay health using official thresholds", async () => {
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {
					degraded: {
						service_name: "Degraded API",
						current_up: 0,
						current_down: 1,
						total_up: 90,
						total_down: 10,
						delay: [350],
						up: [90],
						down: [10],
					},
				},
				cycle_transfer_stats: {},
			},
		});

		const { container } = renderSakura(<SakuraDashboard />);

		fireEvent.click(await screen.findByLabelText("Toggle service panel"));
		expect(await screen.findByText("Degraded API")).toBeInTheDocument();

		const serviceCard = container.querySelector<HTMLElement>(
			".sakura-service-card",
		);
		expect(serviceCard?.querySelector(".service-tracker-status")).toHaveClass(
			"bg-rose-500",
		);
		expect(
			serviceCard?.querySelector(".service-tracker-delay"),
		).toHaveTextContent("350ms");
		expect(serviceCard?.querySelector(".service-tracker-delay")).toHaveClass(
			"text-rose-500",
		);
		expect(serviceCard?.querySelector(".service-tracker-uptime")).toHaveClass(
			"text-rose-500",
		);
		expect(serviceCard).toHaveTextContent("serviceTracker.uptime");
		expect(
			serviceCard?.querySelector(".service-tracker-uptime"),
		).toHaveTextContent("90.0%");
		const dayBars = serviceCard?.querySelectorAll(".service-tracker-day");
		expect(dayBars).toHaveLength(30);
		expect(dayBars?.[0]).toHaveClass("missing");
		expect(dayBars?.[dayBars.length - 1]).not.toHaveClass("warn");
	});

	it("reuses official map, service, and inline view preferences", async () => {
		localStorage.setItem("showMap", "1");
		localStorage.setItem("showServices", "1");
		localStorage.setItem("inline", "1");

		const { container } = renderSakura(<SakuraDashboard />);

		expect(await screen.findByTestId("sakura-global-map")).toHaveTextContent(
			"edge-online,edge-offline",
		);
		expect(await screen.findByText("HTTPS")).toBeInTheDocument();
		expect(container.querySelector(".sakura-server-list")).toBeInTheDocument();
		expect(
			container.querySelectorAll(".sakura-server-list .sakura-server-tile"),
		).toHaveLength(2);

		fireEvent.click(screen.getByLabelText("Toggle server view"));
		expect(localStorage.getItem("inline")).toBe("0");
		expect(
			container.querySelector(".sakura-server-list"),
		).not.toBeInTheDocument();
	});

	it("renders the Sakura toolbar as one direct component tree", async () => {
		const { container } = renderSakura(<SakuraDashboard />);

		const toolbar = container.querySelector(".sakura-toolbar");

		expect(screen.getByText("All")).toBeInTheDocument();
		await waitFor(() =>
			expect(toolbar?.querySelectorAll(".sakura-tool-button")).toHaveLength(3),
		);
		expect(toolbar?.querySelector(".sakura-groups")).toBeInTheDocument();
		expect(
			toolbar?.querySelectorAll(".sakura-group-button").length,
		).toBeGreaterThan(1);
		expect(toolbar?.querySelector(".sakura-sort")).toBeInTheDocument();
		expect(toolbar?.querySelector("[data-nz-tool-button]")).toBeNull();
	});

	it("keeps API groups visible while the websocket frame is incomplete", async () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [createServer({ id: 2, name: "late-group-server" })],
		});

		expect(
			await screen.findByRole("button", { name: "Edge" }),
		).toBeInTheDocument();
	});

	it("discards a persisted group that no longer exists", async () => {
		sessionStorage.setItem("selectedGroup", "Removed group");

		const { container } = renderSakura(<SakuraDashboard />);

		await waitFor(() => {
			expect(container.querySelectorAll(".sakura-server-tile")).toHaveLength(2);
		});
		expect(sessionStorage.getItem("selectedGroup")).toBeNull();
		expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("does not create navigation history when only changing groups", async () => {
		renderSakura(<SakuraDashboard />);
		const edgeGroup = await screen.findByRole("button", { name: "Edge" });

		fireEvent.click(edgeGroup);

		expect(sessionStorage.getItem("selectedGroup")).toBe("group:1");
		expect(sessionStorage.getItem("fromMainPage")).toBeNull();
		expect(sessionStorage.getItem("scrollPosition")).toBeNull();
	});

	it("keeps duplicate group names independent by using their ids", async () => {
		apiMocks.fetchServerGroup.mockResolvedValue({
			success: true,
			data: [
				{
					group: { id: 1, name: "Edge" },
					servers: [1],
				},
				{
					group: { id: 2, name: "Edge" },
					servers: [2],
				},
			],
		});

		const { container } = renderSakura(<SakuraDashboard />);
		const duplicateGroups = await screen.findAllByRole("button", {
			name: "Edge",
		});
		expect(duplicateGroups).toHaveLength(2);

		fireEvent.click(duplicateGroups[1]);
		await waitFor(() => {
			const tiles = container.querySelectorAll(".sakura-server-tile");
			expect(tiles).toHaveLength(1);
			expect(tiles[0]).toHaveTextContent("edge-offline");
		});
		expect(sessionStorage.getItem("selectedGroup")).toBe("group:2");
	});

	it("migrates a legacy stored group name to its stable id", async () => {
		sessionStorage.setItem("selectedGroup", "Edge");

		renderSakura(<SakuraDashboard />);

		await waitFor(() =>
			expect(sessionStorage.getItem("selectedGroup")).toBe("group:1"),
		);
		expect(screen.getByRole("button", { name: "Edge" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("smoothly pans the mobile group strip to the selected final group", async () => {
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			callback(0);
			return 1;
		});
		const { container } = renderSakura(<SakuraDashboard />);
		const scroller = container.querySelector<HTMLElement>(".sakura-groups");
		const finalGroup = await screen.findByRole("button", { name: "Edge" });
		expect(scroller).not.toBeNull();

		Object.defineProperties(scroller as HTMLElement, {
			clientWidth: { configurable: true, value: 120 },
			scrollWidth: { configurable: true, value: 400 },
			scrollLeft: { configurable: true, value: 0, writable: true },
		});
		vi.spyOn(scroller as HTMLElement, "getBoundingClientRect").mockReturnValue({
			bottom: 34,
			height: 34,
			left: 0,
			right: 120,
			top: 0,
			width: 120,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		vi.spyOn(finalGroup, "getBoundingClientRect").mockReturnValue({
			bottom: 32,
			height: 30,
			left: 330,
			right: 390,
			top: 2,
			width: 60,
			x: 330,
			y: 2,
			toJSON: () => ({}),
		});
		const scrollTo = vi.fn();
		Object.defineProperty(scroller, "scrollTo", {
			configurable: true,
			value: scrollTo,
		});

		fireEvent.click(finalGroup);

		expect(scrollTo).toHaveBeenLastCalledWith({
			behavior: "smooth",
			left: 280,
		});
	});

	it("uses the live card placeholder model only for incomplete grid cards", () => {
		const { container } = renderSakura(<SakuraDashboard />);

		const gridTiles = container.querySelectorAll(".sakura-server-tile");
		expect(gridTiles).toHaveLength(2);
		expect(
			gridTiles[0].querySelector(".sakura-card-placeholder"),
		).toHaveTextContent("✧ · · · ✧");

		fireEvent.click(screen.getByLabelText("Toggle server view"));

		expect(container.querySelector(".sakura-server-list")).toBeInTheDocument();
		expect(container.querySelectorAll(".sakura-card-placeholder")).toHaveLength(
			0,
		);
	});

	it("renders live-style unavailable metrics on offline grid cards only", () => {
		const { container } = renderSakura(<SakuraDashboard />);
		const offlineCard = container.querySelector(".nz-card-row.offline");

		expect(offlineCard).toBeInTheDocument();
		expect(
			offlineCard?.querySelectorAll(
				".sakura-gauge-ring[data-sakura-unavailable='true']",
			),
		).toHaveLength(3);
		expect(
			offlineCard?.querySelector(".sakura-server-metrics"),
		).toHaveTextContent("N/A");
		expect(
			offlineCard?.querySelector(".sakura-card-network"),
		).toBeInTheDocument();
		expect(
			offlineCard?.querySelector(".nz-card-title-uptime"),
		).toHaveTextContent("");
		expect(
			offlineCard?.querySelectorAll(".sakura-speed-metric strong"),
		).toHaveLength(2);
		expect(offlineCard?.querySelectorAll(".sakura-gauge > small")).toHaveLength(
			3,
		);
		expect(
			Array.from(
				offlineCard?.querySelectorAll(".sakura-gauge > small") || [],
			).every((value) => value.textContent === "N/A"),
		).toBe(true);
		expect(
			Array.from(
				offlineCard?.querySelectorAll(".sakura-card-transfer-value") || [],
			).every((value) => value.textContent?.includes("N/A")),
		).toBe(true);
	});

	it("does not invent a platform label when offline host data omits it", () => {
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			id: 7,
			name: "offline-no-platform",
			country_code: "",
			last_active: "2024-12-31T23:00:00.000Z",
			host: {
				platform: "",
				platform_version: "",
			},
		});
		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 0,
			servers: [server],
		});

		const gridCard = container.querySelector(".nz-card-row.offline");
		expect(
			gridCard?.querySelector(".sakura-card-flag-slot"),
		).toBeInTheDocument();
		expect(
			gridCard?.querySelector(".sakura-card-flag-slot")?.children,
		).toHaveLength(0);
		expect(
			gridCard?.querySelector(".sakura-card-title-copy"),
		).toHaveTextContent("offline-no-platform");
		expect(gridCard?.querySelector(".nz-card-title-system")).toBeNull();
		expect(
			gridCard?.querySelector(".sakura-card-title-meta"),
		).not.toHaveTextContent("N/A");
		expect(
			gridCard?.querySelector(".sakura-card-title-meta"),
		).not.toHaveTextContent("--");

		fireEvent.click(screen.getByLabelText("Toggle server view"));

		expect(
			container.querySelector(".sakura-list-system-copy strong"),
		).toHaveTextContent("");
	});

	it("renders the list-mode system column through the official platform label", async () => {
		localStorage.setItem("inline", "1");
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			name: "debian-list",
			host: {
				platform: "linux",
				platform_version: "Debian GNU/Linux 12 (bookworm)",
				gpu: ["NVIDIA T4"],
			},
			state: {
				gpu: [42.5],
				temperatures: [
					{ Name: "CPU Core", Temperature: 55.5 },
					{ Name: "NVMe", Temperature: 44 },
				],
			},
		});

		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [server],
		});

		expectVisibleListServerName(container, "debian-list");
		const platformMetric = container.querySelector(".sakura-list-system");

		expect(platformMetric).toHaveTextContent("Debian");
		expect(
			platformMetric?.querySelector("i[class*='fl-']"),
		).toBeInTheDocument();
	});

	it("preserves the official list usage color thresholds", () => {
		localStorage.setItem("inline", "1");
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const servers = [70, 71, 91].map((cpu, index) =>
			createServer({
				id: index + 1,
				name: `usage-${cpu}`,
				state: { cpu },
			}),
		);
		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: servers.length,
			servers,
		});
		const tones = Array.from(
			container.querySelectorAll<HTMLElement>(
				".sakura-list-metric:nth-child(3) .sakura-list-progress",
			),
		).map((progress) => progress.dataset.sakuraUsageTone);

		expect(tones).toEqual(["healthy", "warning", "critical"]);
	});

	it("renders list-mode cycle transfer as the compact legacy row", async () => {
		localStorage.setItem("inline", "1");
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {},
				cycle_transfer_stats: {
					monthly: {
						name: "Monthly",
						from: "2026-07-01T00:00:00.000Z",
						to: "2026-08-01T00:00:00.000Z",
						max: -1,
						min: 0,
						server_name: {
							"1": "edge-online",
						},
						transfer: {
							"1": 1024 ** 3,
						},
						next_update: {
							"1": "2026-08-01T00:00:00.000Z",
						},
					},
				},
			},
		});

		const { container } = renderSakura(<SakuraDashboard />);

		await waitFor(() =>
			expect(
				container.querySelectorAll(".sakura-list-cycle-transfer"),
			).toHaveLength(1),
		);
		expect(
			container.querySelector(".sakura-list-business .sakura-cycle-block"),
		).not.toBeInTheDocument();
		const cycleRow = container.querySelector<HTMLElement>(
			".sakura-list-cycle-transfer",
		);
		expect(cycleRow).toHaveClass("nz-list-cycle-infinite");
		expect(cycleRow).toHaveAttribute("title", "Monthly");
		expect(
			cycleRow?.querySelector(".sakura-list-cycle-name"),
		).toHaveTextContent("1.00 GiB / \u221e");
		expect(
			cycleRow?.querySelector(".sakura-list-cycle-percent"),
		).toHaveTextContent("\u221e");
		expect(cycleRow?.querySelector(".sakura-list-cycle-bar i")).toHaveStyle({
			width: "100%",
		});
		expect(
			cycleRow?.querySelector(".sakura-cycle-meta"),
		).not.toBeInTheDocument();
	});

	it("renders billing, cycle transfer, and plan tags as real sections", async () => {
		const publicNote = JSON.stringify({
			billingDataMod: {
				amount: "-1",
				autoRenewal: "",
				cycle: "monthly",
				endDate: "0000-00-00T00:00:00.000Z",
				startDate: "",
			},
			planDataMod: {
				IPv4: "1",
				IPv6: "1",
				bandwidth: "",
				extra: "",
				networkRoute: "AS4809",
				trafficType: "",
				trafficVol: "",
			},
		});
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {},
				cycle_transfer_stats: {
					monthly: {
						name: "Monthly",
						from: "2026-07-01T00:00:00.000Z",
						to: "2026-08-01T00:00:00.000Z",
						max: -1,
						min: 0,
						server_name: {
							"1": "edge-online",
						},
						transfer: {
							"1": 1024 ** 3,
						},
						next_update: {
							"1": "2026-08-01T00:00:00.000Z",
						},
					},
				},
			},
		});
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			id: 1,
			name: "edge-online",
			public_note: publicNote,
		});

		const card = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [server],
		});

		await waitFor(() =>
			expect(
				card.container.querySelector(".sakura-cycle-block"),
			).toBeInTheDocument(),
		);
		expect(
			card.container.querySelector("[data-sakura-billing-tone='usage']"),
		).toBeInTheDocument();
		const cardBusiness = card.container.querySelector(".sakura-card-business");
		expect(cardBusiness).toHaveTextContent("1.00 GiB / ∞");
		expect(cardBusiness).toHaveTextContent("billingInfo.indefinite");
		expect(
			cardBusiness?.querySelector(".sakura-cycle-block"),
		).toBeInTheDocument();
		expect(
			card.container.querySelector(".nz-card-tag-section.sakura-plan-row"),
		).toBeInTheDocument();
		card.unmount();

		localStorage.setItem("inline", "1");
		const list = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [server],
		});

		await waitFor(() =>
			expect(
				list.container.querySelector(".sakura-list-cycle-transfer"),
			).toBeInTheDocument(),
		);
		expect(
			list.container.querySelector(".sakura-list-cycle-transfer"),
		).toHaveTextContent("1.00 GiB / ∞");
		expect(
			list.container.querySelector(".nz-card-tag-section.sakura-plan-row"),
		).toBeInTheDocument();
	});

	it("clamps list-mode title width for long server names", async () => {
		localStorage.setItem("inline", "1");
		const originalCreateElement = document.createElement.bind(document);
		vi.spyOn(document, "createElement").mockImplementation(
			(tagName, options) => {
				if (tagName === "canvas") {
					return {
						getContext: vi.fn(() => ({
							font: "",
							measureText: vi.fn(() => ({ width: 500 })),
						})),
					} as unknown as HTMLCanvasElement;
				}

				return originalCreateElement(tagName, options);
			},
		);
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			name: "edge-super-long-production-singapore-observability-node-01",
		});

		const { container } = renderSakura(<SakuraDashboard />, "/", {
			now,
			online: 1,
			servers: [server],
		});

		expectVisibleListServerName(container, server.name);
		const list = container.querySelector<HTMLElement>(".sakura-server-list");

		expect(list).toBeInTheDocument();
		expect(list?.style.getPropertyValue("--sakura-list-title-width")).toBe(
			"220px",
		);
		expect(
			container.querySelector(".sakura-server-list .sakura-server-tile.wide"),
		).toBeInTheDocument();
	});

	it("keeps forced map, service, and inline view enabled from public config", async () => {
		localStorage.setItem("showMap", "0");
		localStorage.setItem("showServices", "0");
		localStorage.setItem("inline", "0");
		Object.assign(window, {
			ForceCardInline: true,
			ForceShowMap: true,
			ForceShowServices: true,
		});

		const { container } = renderSakura(<SakuraDashboard />);

		expect(await screen.findByTestId("sakura-global-map")).toBeInTheDocument();
		expect(await screen.findByText("HTTPS")).toBeInTheDocument();
		expect(container.querySelector(".sakura-server-list")).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText("Toggle map panel"));
		fireEvent.click(screen.getByLabelText("Toggle service panel"));
		fireEvent.click(screen.getByLabelText("Toggle server view"));

		expect(screen.getByTestId("sakura-global-map")).toBeInTheDocument();
		expect(screen.getByText("HTTPS")).toBeInTheDocument();
		expect(container.querySelector(".sakura-server-list")).toBeInTheDocument();
		expect(localStorage.getItem("showMap")).toBe("0");
		expect(localStorage.getItem("showServices")).toBe("0");
		expect(localStorage.getItem("inline")).toBe("0");

		act(() => {
			window.ForceCardInline = false;
			window.ForceShowMap = false;
			window.ForceShowServices = false;
			window.__sakuraSyncThemeConfig?.();
		});

		expect(screen.queryByTestId("sakura-global-map")).not.toBeInTheDocument();
		expect(screen.queryByText("HTTPS")).not.toBeInTheDocument();
		expect(
			container.querySelector(".sakura-server-list"),
		).not.toBeInTheDocument();
	});

	it("hides the service toggle when service data is empty", async () => {
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {},
				cycle_transfer_stats: {},
			},
		});

		renderSakura(<SakuraDashboard />);

		await waitFor(() => expect(apiMocks.fetchService).toHaveBeenCalled());
		expect(screen.getByLabelText("Toggle map panel")).toBeInTheDocument();
		expect(screen.getByLabelText("Toggle server view")).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Toggle service panel"),
		).not.toBeInTheDocument();
	});

	it("uses the Sakura sort popover for custom total rate sorting", () => {
		renderSakura(<SakuraDashboard />);

		fireEvent.click(screen.getByText("sort.label"));
		fireEvent.click(
			screen.getByRole("menuitemradio", { name: "sort.types.rate" }),
		);

		expect(screen.getByText("sort.types.rate")).toBeInTheDocument();
		expect(screen.getByLabelText("Descending")).toBeEnabled();

		fireEvent.click(screen.getByText("sort.types.rate"));
		expect(
			screen.getByRole("menuitemradio", { name: "sort.types.cpu" }),
		).toBeInTheDocument();

		fireEvent.keyDown(document, { key: "Escape" });
		expect(
			screen.queryByRole("menuitemradio", { name: "sort.types.cpu" }),
		).not.toBeInTheDocument();
	});

	it("toggles overview metric sorting off when the same metric is clicked twice", () => {
		renderSakura(<SakuraDashboard />);

		const uploadRateButton = screen.getAllByRole("button", {
			name: /serverOverview\.trafficRate/,
		})[0];

		fireEvent.click(uploadRateButton);

		expect(screen.getByText("sort.types.up")).toBeInTheDocument();
		expect(screen.getByLabelText("Descending")).toBeEnabled();
		expect(uploadRateButton).toHaveAttribute("aria-pressed", "true");

		fireEvent.click(uploadRateButton);

		expect(screen.getByText("sort.label")).toBeInTheDocument();
		expect(screen.getByLabelText("Sort direction disabled")).toBeDisabled();
		expect(uploadRateButton).toHaveAttribute("aria-pressed", "false");
	});

	it("exposes overview selection through native button state", () => {
		renderSakura(<SakuraDashboard />);

		const totalCard = screen.getByRole("button", {
			name: /serverOverview\.totalServers/,
		});
		const offlineCard = screen.getByRole("button", {
			name: /serverOverview\.offlineServers/,
		});

		expect(totalCard).not.toHaveAttribute("aria-pressed");
		expect(offlineCard).toHaveAttribute("aria-pressed", "false");
		expect(totalCard).not.toHaveClass("sakura-metric-card-highlighted");
		fireEvent.click(totalCard);
		expect(totalCard).not.toHaveClass("sakura-metric-card-highlighted");
		fireEvent.click(offlineCard);
		expect(totalCard).not.toHaveAttribute("aria-pressed");
		expect(offlineCard).toHaveAttribute("aria-pressed", "true");
		expect(offlineCard).toHaveClass("sakura-metric-card-highlighted");
		fireEvent.click(offlineCard);
		expect(totalCard).not.toHaveAttribute("aria-pressed");
		expect(offlineCard).toHaveAttribute("aria-pressed", "false");
		expect(offlineCard).not.toHaveClass("sakura-metric-card-highlighted");
		fireEvent.click(offlineCard);
		expect(offlineCard).toHaveClass("sakura-metric-card-highlighted");
		fireEvent.click(totalCard);
		expect(totalCard).not.toHaveClass("sakura-metric-card-highlighted");
		expect(offlineCard).not.toHaveClass("sakura-metric-card-highlighted");
	});

	it("renders Sakura server detail from websocket data", async () => {
		Object.assign(window, {
			ForceUseSvgFlag: true,
		});
		apiMocks.fetchService.mockResolvedValue({
			success: true,
			data: {
				services: {},
				cycle_transfer_stats: {
					monthly: {
						name: "Monthly",
						from: "2026-07-01T00:00:00.000Z",
						to: "2026-08-01T00:00:00.000Z",
						max: -1,
						min: 0,
						server_name: {
							"1": "edge-online",
						},
						transfer: {
							"1": 1024 ** 3,
						},
						next_update: {
							"1": "2026-08-01T00:00:00.000Z",
						},
					},
				},
			},
		});
		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			id: 1,
			name: "edge-online",
			host: {
				platform: "linux",
				platform_version: "Debian GNU/Linux 12 (bookworm)",
				gpu: ["NVIDIA T4"],
			},
			state: {
				gpu: [42.5],
				temperatures: [
					{ Name: "CPU Core", Temperature: 55.5 },
					{ Name: "NVMe", Temperature: 44 },
				],
			},
		});

		const { container } = renderSakura(
			<Routes>
				<Route path="/server/:id" element={<SakuraServerDetail />} />
			</Routes>,
			"/server/1",
			{
				now,
				online: 1,
				servers: [server],
			},
		);

		expect(container.querySelector(".sakura-detail-view")).toBeInTheDocument();
		expect(container.querySelector(".server-name")).toBeInTheDocument();
		expect(
			screen.getByText(/greeting\.(morning|noon|afternoon|evening)/),
		).toBeInTheDocument();
		expect(screen.getByText("whereTheTimeIs")).toBeInTheDocument();
		expect(
			container.querySelector(".sakura-detail-overview"),
		).toBeInTheDocument();
		expect(
			container.querySelector(".sakura-detail-grid"),
		).not.toBeInTheDocument();
		expect(
			container.querySelector(".sakura-detail-business"),
		).not.toBeInTheDocument();
		expect(
			container.querySelector(".sakura-cycle-block"),
		).not.toBeInTheDocument();
		expect(screen.getByText("edge-online")).toBeInTheDocument();
		expect(screen.getAllByText(/Debian/).length).toBeGreaterThan(0);
		expect(screen.getByText("United States")).toBeInTheDocument();
		expect(screen.queryByText("serverDetail.city")).not.toBeInTheDocument();
		expect(screen.getByText("serverDetail.country")).toBeInTheDocument();
		expect(
			document.querySelector(".sakura-detail-view .sakura-flag-image"),
		).toBeNull();
		expect(screen.getAllByText("serverDetail.online").length).toBeGreaterThan(
			0,
		);
		expect(screen.getAllByText("serverDetail.uptime").length).toBeGreaterThan(
			0,
		);
		expect(
			screen.getAllByText("serverDetail.lastActive").length,
		).toBeGreaterThan(0);
		expect(screen.getAllByText("NVIDIA T4").length).toBeGreaterThan(0);
		fireEvent.click(screen.getByText("serverDetail.temperature"));
		expect(screen.getByText("CPU Core")).toBeInTheDocument();
		expect(screen.getByText(/55.50/)).toBeInTheDocument();
		expect(screen.getByTestId("sakura-detail-chart")).toHaveTextContent(
			"detail chart 1",
		);
		expect(screen.queryByText("Monthly")).not.toBeInTheDocument();
		expect(screen.queryByText("cycleTransfer.used")).not.toBeInTheDocument();
		expect(screen.queryByText("cycleTransfer.period")).not.toBeInTheDocument();
		expect(
			screen.queryByText("cycleTransfer.nextUpdate"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("1.00 GiB / \u221e")).not.toBeInTheDocument();

		fireEvent.click(screen.getByText("tabSwitch.Network"));
		expect(await screen.findByTestId("sakura-network-chart")).toHaveTextContent(
			"network chart 1",
		);
	});

	it("redirects invalid Sakura server ids to the error route", () => {
		renderSakura(
			<Routes>
				<Route path="/server/:id" element={<SakuraServerDetail />} />
				<Route path="/error" element={<p>error-route</p>} />
			</Routes>,
			"/server/not-a-number",
		);

		expect(screen.getByText("error-route")).toBeInTheDocument();
		expect(screen.getByText("/error")).toBeInTheDocument();
	});

	it("redirects missing Sakura servers after websocket data is available", () => {
		renderSakura(
			<Routes>
				<Route path="/server/:id" element={<SakuraServerDetail />} />
				<Route path="/error" element={<p>missing-server</p>} />
			</Routes>,
			"/server/999",
			{
				now: Date.now(),
				online: 1,
				servers: [createServer({ id: 1 })],
			},
		);

		expect(screen.getByText("missing-server")).toBeInTheDocument();
		expect(screen.getByText("/error")).toBeInTheDocument();
	});

	it("passes ForceUseSvgFlag through the official detail overview", async () => {
		window.ForceUseSvgFlag = false;
		const originalCreateElement = document.createElement.bind(document);
		const canvasContext = {
			fillStyle: "",
			textBaseline: "",
			font: "",
			fillText: vi.fn(),
			getImageData: vi.fn(() => ({
				data: new Uint8ClampedArray([0, 0, 0, 255]),
			})),
		} as unknown as CanvasRenderingContext2D;
		vi.spyOn(document, "createElement").mockImplementation(
			(tagName, options) => {
				if (tagName === "canvas") {
					return {
						getContext: vi.fn(() => canvasContext),
					} as unknown as HTMLCanvasElement;
				}

				return originalCreateElement(tagName, options);
			},
		);

		const now = Date.parse("2025-01-01T00:00:20.000Z");
		const server = createServer({
			id: 1,
			name: "edge-online",
			country_code: "us",
		});

		const { container } = renderSakura(
			<Routes>
				<Route path="/server/:id" element={<SakuraServerDetail />} />
			</Routes>,
			"/server/1",
			{
				now,
				online: 1,
				servers: [server],
			},
		);

		expect(await screen.findByText("edge-online")).toBeInTheDocument();
		await waitFor(() =>
			expect(
				container.querySelector(".sakura-flag-image"),
			).not.toBeInTheDocument(),
		);
	});
});
