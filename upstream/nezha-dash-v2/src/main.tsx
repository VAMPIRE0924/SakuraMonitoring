import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "font-logos/assets/font-logos.css";
import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";
import { CommandProvider } from "./context/command-provider";
import { SortProvider } from "./context/sort-provider";
import { StatusProvider } from "./context/status-provider";
import { WebSocketProvider } from "./context/websocket-provider";
import { useCommand } from "./hooks/use-command";
import "./i18n";
import "./index.css";

const queryClient = new QueryClient();
const DashCommand = lazy(() =>
	import("./components/DashCommand").then((module) => ({
		default: module.DashCommand,
	})),
);
const ReactQueryDevtools =
	import.meta.env.DEV && import.meta.env.VITE_ENABLE_QUERY_DEVTOOLS === "true"
		? lazy(() =>
				import("@tanstack/react-query-devtools").then((module) => ({
					default: module.ReactQueryDevtools,
				})),
			)
		: null;

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

function CommandOverlay() {
	const { isOpen } = useCommand();
	if (!isOpen) return null;

	return (
		<Suspense fallback={null}>
			<DashCommand />
		</Suspense>
	);
}

ReactDOM.createRoot(rootElement).render(
	<ThemeProvider storageKey="vite-ui-theme">
		<QueryClientProvider client={queryClient}>
			<WebSocketProvider url="/api/v1/ws/server">
				<CommandProvider>
					<CommandOverlay />
					<StatusProvider>
						<SortProvider>
							<App />
							{ReactQueryDevtools ? (
								<Suspense fallback={null}>
									<ReactQueryDevtools />
								</Suspense>
							) : null}
						</SortProvider>
					</StatusProvider>
				</CommandProvider>
			</WebSocketProvider>
		</QueryClientProvider>
	</ThemeProvider>,
);
