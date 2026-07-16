import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => {
		const accessibleNames: Record<string, string> = {
			"common.close": "Close",
			"common.serverDetail": "Server detail",
			"common.serverDetailViews": "Server detail views",
			"common.serverMonitoringDetail": "Server monitoring detail",
			"controls.changeLanguage": "Change language",
			"controls.hideBackground": "Hide background",
			"controls.restoreBackground": "Restore background",
			"controls.search": "Search",
			"controls.serverGroups": "Server groups",
			"controls.toggleMap": "Toggle map panel",
			"controls.toggleServerView": "Toggle server view",
			"controls.toggleServices": "Toggle service panel",
			"controls.toggleTheme": "Toggle theme",
			"sort.ascending": "Ascending",
			"sort.descending": "Descending",
			"sort.directionDisabled": "Sort direction disabled",
		};

		return {
			t: (key: string) => accessibleNames[key] ?? key,
			i18n: {
				language: "en-US",
				languages: ["en-US"],
				changeLanguage: vi.fn(),
			},
		};
	},
}));

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}

class IntersectionObserverMock {
	readonly root = null;
	readonly rootMargin = "";
	readonly thresholds = [];

	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
	takeRecords = vi.fn(() => []);
}

Object.defineProperty(globalThis, "ResizeObserver", {
	writable: true,
	value: ResizeObserverMock,
});

Object.defineProperty(globalThis, "IntersectionObserver", {
	writable: true,
	value: IntersectionObserverMock,
});

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
	configurable: true,
	value: vi.fn(),
});

Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
	configurable: true,
	value: vi.fn(() => false),
});

Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
	configurable: true,
	value: vi.fn(),
});

Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
	configurable: true,
	value: vi.fn(),
});

Object.defineProperty(window, "scrollTo", {
	configurable: true,
	value: vi.fn(),
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
	configurable: true,
	value: vi.fn(() => ({
		font: "",
		measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
	})),
});

afterEach(() => {
	cleanup();
	localStorage.clear();
	sessionStorage.clear();
	document.head
		.querySelectorAll(
			'meta[name="theme-color"], link[rel*="icon"], [data-injected]',
		)
		.forEach((node) => {
			node.remove();
		});
	document.title = "";
	document.body.querySelectorAll("[data-injected]").forEach((node) => {
		node.remove();
	});
	document.documentElement.className = "";
	document.documentElement.removeAttribute("style");
	Object.defineProperty(document, "cookie", {
		configurable: true,
		value: "",
	});
	window.CustomBackgroundImage = "";
	window.CustomMobileBackgroundImage = "";
	window.CustomTitle = "";
	window.CustomSiteName = "";
	window.CustomLogo = "";
	window.CustomFavicon = "";
	window.CustomDesc = "";
	window.CustomLinks = "";
	window.CustomIllustration = "";
	window.CustomLoadingIllustration = "";
	window.ShowNetTransfer = false;
	window.FixedTopServerName = false;
	window.ForceUseSvgFlag = false;
	window.DisableAnimatedMan = false;
	window.ForceTheme = "";
	window.ForceShowServices = false;
	window.ForceCardInline = false;
	window.ForceShowMap = false;
	window.ForcePeakCutEnabled = false;
	window.ForceSortType = undefined;
	window.ForceSortOrder = undefined;
	window.CustomFooterPowered = {
		show: false,
		prefix: "",
		name: "",
		url: "",
	};
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});
