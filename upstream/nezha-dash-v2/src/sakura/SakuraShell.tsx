import { ImageMinus, Languages, Moon, Search, Sun } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SakuraPageLoader } from "@/components/loading/SakuraPageLoader";
import type { Theme } from "@/components/ThemeProvider";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCommand } from "@/hooks/use-command";
import { useLoginProfile } from "@/hooks/use-login-profile";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import { useTheme } from "@/hooks/use-theme";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import {
	getStoredItem,
	removeStoredItem,
	setStoredItem,
} from "@/lib/browser-storage";
import { parseCustomLinks } from "@/lib/custom-links";
import {
	readSafeUrl,
	type SakuraRuntimeConfig,
	setSakuraBackgroundImage,
} from "@/lib/sakura-config";
import {
	normalizeSupportedLanguage,
	SUPPORTED_LANGUAGES,
} from "@/lib/supported-languages";
import { cn } from "@/lib/utils";

type SakuraShellProps = {
	children: React.ReactNode;
};

const BLANK_FAVICON =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

function SakuraIconButton({
	children,
	className,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			className={cn("nz-header-icon-button sakura-icon-button", className)}
			{...props}
		>
			{children}
		</button>
	);
}

function SakuraHeader({ config }: { config: SakuraRuntimeConfig }) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const backgroundImage = config.backgroundImage || undefined;
	const { openCommand } = useCommand();
	const { theme, setTheme } = useTheme();
	const { connected, connectionState, lastData, setNeedReconnect } =
		useWebSocketContext();
	const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
	const previousLoginState = useRef<boolean | null>(null);
	const links = useMemo(() => parseCustomLinks(config.links), [config.links]);

	const { isLogin, isFetched, isError } = useLoginProfile();

	useEffect(() => {
		if (isFetched || isError) {
			if (
				previousLoginState.current !== null &&
				previousLoginState.current !== isLogin
			) {
				setNeedReconnect(true);
			}
			previousLoginState.current = isLogin;
		}
	}, [isLogin, isError, isFetched, setNeedReconnect]);

	useEffect(() => {
		document.title = config.title || "";

		const iconHref = config.favicon || BLANK_FAVICON;
		document
			.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]')
			.forEach((link) => {
				if (!link.dataset.sakuraFavicon) link.remove();
			});

		const favicon =
			document.querySelector<HTMLLinkElement>(
				'link[data-sakura-favicon="true"]',
			) || document.createElement("link");
		if (iconHref === BLANK_FAVICON) {
			favicon.type = "image/svg+xml";
		} else {
			favicon.removeAttribute("type");
		}
		favicon.rel = "icon";
		favicon.dataset.sakuraFavicon = "true";
		favicon.href = iconHref;
		document.head.appendChild(favicon);
	}, [config.favicon, config.title]);

	useEffect(() => {
		const language = normalizeSupportedLanguage(
			i18n.resolvedLanguage || i18n.language,
		);
		document.documentElement.lang = language;
		document.documentElement.dataset.sakuraUiLang = language
			.slice(0, 2)
			.toLowerCase();

		return () => {
			delete document.documentElement.dataset.sakuraUiLang;
		};
	}, [i18n.language, i18n.resolvedLanguage]);

	const title = config.title;
	const description = config.description;
	const logo = config.logo;
	const brandTitle = title || description;
	const brandDescription = title ? description : "";
	const hasBrand = Boolean(brandTitle || brandDescription || logo);
	const hasLinks = links.length > 0;
	const savedBackgroundImage = getStoredItem(
		"sessionStorage",
		"savedBackgroundImage",
	);
	const hasBackgroundToggle = Boolean(backgroundImage || savedBackgroundImage);
	const hideBackgroundToggleOnMobile = Boolean(config.mobileBackgroundImage);
	const authHref = isLogin ? "/dashboard" : "/dashboard/login";
	const authLabel = isLogin ? t("dashboard") : t("login");
	const onlineCount = connected ? (lastData?.online ?? 0) : null;
	const connectionLabel =
		connectionState === "connecting"
			? t("connecting")
			: connected
				? t("online")
				: t("offline");

	const changeTheme = (newTheme: Theme) => {
		setTheme(newTheme);
	};

	const toggleBackground = () => {
		if (backgroundImage) {
			setStoredItem("sessionStorage", "savedBackgroundImage", backgroundImage);
			setSakuraBackgroundImage(undefined);
			return;
		}

		const restoredBackground = readSafeUrl(savedBackgroundImage);
		if (restoredBackground) {
			setSakuraBackgroundImage(restoredBackground);
		}
	};

	const localeItems = SUPPORTED_LANGUAGES.map((code) => ({
		code,
		name: t(`language.${code}`),
	}));

	const customLinks = (
		<nav className="sakura-header-links" aria-label={t("controls.customLinks")}>
			{links.map((link) => (
				<a
					key={`${link.name}-${link.link}`}
					href={link.link}
					target="_blank"
					rel="noopener noreferrer"
				>
					{link.name}
				</a>
			))}
		</nav>
	);

	const authLink = (
		<a href={authHref} className="sakura-auth-link">
			{authLabel}
		</a>
	);

	return (
		<>
			<header
				className={cn("sakura-header", {
					"header-top": true,
					"sakura-header-no-brand": !hasBrand,
					"sakura-header-no-links": !hasLinks,
				})}
			>
				{hasBrand && (
					<button
						type="button"
						className="header-logo sakura-brand"
						onClick={() => {
							removeStoredItem("sessionStorage", "selectedGroup");
							navigate("/");
						}}
					>
						{logo && <img src={logo} alt="" className="sakura-brand-logo" />}
						{(brandTitle || brandDescription) && (
							<span className="sakura-brand-text">
								{brandTitle && <strong>{brandTitle}</strong>}
								{brandDescription && <span>{brandDescription}</span>}
							</span>
						)}
					</button>
				)}
				<div className="sakura-header-desktop-links">
					{hasLinks && customLinks}
				</div>
				<section className="header-handles sakura-header-actions">
					{authLink}
					<SakuraIconButton
						onClick={openCommand}
						aria-label={t("controls.search")}
					>
						<Search size={16} />
					</SakuraIconButton>
					<DropdownMenu
						open={languageMenuOpen}
						onOpenChange={setLanguageMenuOpen}
					>
						<DropdownMenuTrigger asChild>
							<SakuraIconButton aria-label={t("controls.changeLanguage")}>
								<Languages size={16} />
							</SakuraIconButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="sakura-header-menu" align="end">
							{localeItems.map((item) => (
								<DropdownMenuItem
									className={cn("sakura-header-menu-item", {
										active:
											normalizeSupportedLanguage(i18n.language) === item.code,
									})}
									key={item.code}
									onSelect={() => {
										setLanguageMenuOpen(false);
										void i18n.changeLanguage(
											normalizeSupportedLanguage(item.code),
										);
									}}
								>
									{item.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<SakuraIconButton aria-label={t("controls.toggleTheme")}>
								<Sun className="sakura-sun" size={16} />
								<Moon className="sakura-moon" size={16} />
							</SakuraIconButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="sakura-header-menu" align="end">
							<DropdownMenuItem
								className={cn("sakura-header-menu-item", {
									active: theme === "light",
								})}
								onSelect={() => changeTheme("light")}
							>
								{t("theme.light")}
							</DropdownMenuItem>
							<DropdownMenuItem
								className={cn("sakura-header-menu-item", {
									active: theme === "dark",
								})}
								onSelect={() => changeTheme("dark")}
							>
								{t("theme.dark")}
							</DropdownMenuItem>
							<DropdownMenuItem
								className={cn("sakura-header-menu-item", {
									active: theme === "system",
								})}
								onSelect={() => changeTheme("system")}
							>
								{t("theme.system")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					{hasBackgroundToggle && (
						<SakuraIconButton
							aria-label={t(
								backgroundImage
									? "controls.hideBackground"
									: "controls.restoreBackground",
							)}
							className="sakura-background-toggle"
							data-mobile-hidden={
								hideBackgroundToggleOnMobile ? "true" : "false"
							}
							onClick={toggleBackground}
						>
							<ImageMinus size={16} />
						</SakuraIconButton>
					)}
					<div
						className="sakura-online-pill"
						data-state={connectionState}
						role="status"
						aria-label={
							onlineCount === null
								? connectionLabel
								: `${onlineCount} ${connectionLabel}`
						}
					>
						{onlineCount !== null && (
							<span className="sakura-online-count">{onlineCount}</span>
						)}
						<span>{connectionLabel}</span>
						<span
							className={cn("sakura-connection-dot", {
								offline: connectionState === "disconnected",
								connecting: connectionState === "connecting",
							})}
						/>
					</div>
				</section>
			</header>
			<div className="sakura-header-mobile-links">
				{authLink}
				{hasLinks && customLinks}
			</div>
		</>
	);
}

function SakuraFooter({ config }: { config: SakuraRuntimeConfig }) {
	if (!config.footerPowered.show || !config.footerPowered.name) {
		return null;
	}

	return (
		<footer className="sakura-footer">
			<span>
				{config.footerPowered.prefix && `${config.footerPowered.prefix} `}
				{config.footerPowered.url ? (
					<a
						href={config.footerPowered.url}
						target="_blank"
						rel="noopener noreferrer"
					>
						{config.footerPowered.name}
					</a>
				) : (
					config.footerPowered.name
				)}
			</span>
		</footer>
	);
}

export function SakuraShell({ children }: SakuraShellProps) {
	const config = useSakuraRuntimeConfig();

	return (
		<div className="sakura-shell">
			<SakuraHeader config={config} />
			{children}
			<SakuraFooter config={config} />
		</div>
	);
}

export function SakuraRefreshToast() {
	const { t } = useTranslation();
	const { needReconnect, reconnect, setNeedReconnect } = useWebSocketContext();

	useEffect(() => {
		if (!needReconnect) return;

		removeStoredItem("sessionStorage", "needRefresh");
		reconnect();
		const timer = window.setTimeout(() => {
			setNeedReconnect(false);
		}, 1000);

		return () => {
			window.clearTimeout(timer);
		};
	}, [needReconnect, reconnect, setNeedReconnect]);

	if (!needReconnect) return null;

	return (
		<SakuraPageLoader label={`${t("refreshing")}...`} targetProgress={92} />
	);
}
