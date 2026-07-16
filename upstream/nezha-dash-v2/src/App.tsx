import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

import ErrorBoundary from "./components/ErrorBoundary";
import { SakuraPageLoader } from "./components/loading/SakuraPageLoader";
import { useCommand } from "./hooks/use-command";
import { useSakuraRuntimeConfig } from "./hooks/use-sakura-config";
import { useSakuraPointerInput } from "./hooks/use-sakura-pointer-input";
import { useTheme } from "./hooks/use-theme";
import { InjectContext } from "./lib/inject";
import { fetchSetting } from "./lib/nezha-api";
import {
	notifySakuraRuntimeConfigChanged,
	resetSakuraRuntimeConfigOverrides,
} from "./lib/sakura-config";
import { cn } from "./lib/utils";
import ErrorPage from "./pages/ErrorPage";
import SakuraDashboard from "./sakura/SakuraDashboard";
import { SakuraRefreshToast, SakuraShell } from "./sakura/SakuraShell";

const NotFound = lazy(() => import("./pages/NotFound"));
const SakuraServerDetail = lazy(() => import("./sakura/SakuraServerDetail"));
const DashCommand = lazy(() =>
	import("./components/DashCommand").then((module) => ({
		default: module.DashCommand,
	})),
);

function RouteFallback() {
	return <SakuraPageLoader />;
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

function MainApp() {
	const { data: settingData, error } = useQuery({
		queryKey: ["setting"],
		queryFn: ({ signal }) => fetchSetting(signal),
	});
	const { t } = useTranslation();
	const { setTheme } = useTheme();
	const [injectedCustomCode, setInjectedCustomCode] = useState<string | null>(
		null,
	);
	const sakuraConfig = useSakuraRuntimeConfig();
	const customBackgroundImage = sakuraConfig.backgroundImage || undefined;
	const settingCustomCode = settingData?.data?.config.custom_code ?? "";
	useSakuraPointerInput();

	useEffect(() => {
		let cancelled = false;

		void InjectContext(settingCustomCode, {
			beforeInject: resetSakuraRuntimeConfigOverrides,
		}).finally(() => {
			if (cancelled) return;

			notifySakuraRuntimeConfigChanged();
			setInjectedCustomCode(settingCustomCode);
		});

		return () => {
			cancelled = true;
		};
	}, [settingCustomCode]);

	useEffect(() => {
		if (
			sakuraConfig.forceTheme === "dark" ||
			sakuraConfig.forceTheme === "light"
		) {
			setTheme(sakuraConfig.forceTheme);
		}
	}, [sakuraConfig.forceTheme, setTheme]);

	if (error && !settingData) {
		return (
			<ErrorPage
				code={500}
				message={t("error.backendUnavailableDescription")}
			/>
		);
	}

	if (!settingData) {
		return <SakuraPageLoader targetProgress={36} />;
	}

	if (injectedCustomCode !== settingCustomCode) {
		return <SakuraPageLoader targetProgress={62} />;
	}

	const customMobileBackgroundImage =
		sakuraConfig.mobileBackgroundImage || undefined;

	return (
		<ErrorBoundary>
			{customBackgroundImage && (
				<div
					className={cn(
						"fixed inset-0 z-0 min-h-lvh bg-cover bg-center bg-no-repeat dark:brightness-75",
						{
							"hidden sm:block": customMobileBackgroundImage,
						},
					)}
					style={{ backgroundImage: `url("${customBackgroundImage}")` }}
				/>
			)}
			{customMobileBackgroundImage && (
				<div
					className="fixed inset-0 z-0 min-h-lvh bg-cover bg-center bg-no-repeat sm:hidden dark:brightness-75"
					style={{ backgroundImage: `url("${customMobileBackgroundImage}")` }}
				/>
			)}
			<div
				data-sakura-theme="true"
				className={cn("sakura-theme min-h-screen", {
					"bg-background": !customBackgroundImage,
				})}
			>
				<main className="relative z-20 min-h-screen">
					<SakuraRefreshToast />
					<SakuraShell>
						<Routes>
							<Route path="/" element={<SakuraDashboard />} />
							<Route
								path="/server/:id"
								element={
									<Suspense fallback={<RouteFallback />}>
										<SakuraServerDetail />
									</Suspense>
								}
							/>
							<Route path="/error" element={<ErrorPage />} />
							<Route
								path="*"
								element={
									<Suspense fallback={<RouteFallback />}>
										<NotFound />
									</Suspense>
								}
							/>
						</Routes>
					</SakuraShell>
				</main>
			</div>
		</ErrorBoundary>
	);
}

function App() {
	return (
		<Router basename={import.meta.env.BASE_URL}>
			<CommandOverlay />
			<MainApp />
		</Router>
	);
}

export default App;
