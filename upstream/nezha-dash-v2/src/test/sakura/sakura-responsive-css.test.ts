import fs from "node:fs";
import path from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const cssPath = path.resolve(process.cwd(), "src/index.css");
const root = postcss.parse(fs.readFileSync(cssPath, "utf8"), { from: cssPath });

function mediaRules(params: string) {
	const rules: Rule[] = [];
	root.walkAtRules("media", (atRule: AtRule) => {
		if (atRule.params !== params) return;
		atRule.walkRules((rule) => {
			rules.push(rule);
		});
	});
	return rules;
}

function declarationValue(rule: Rule, property: string) {
	let value = "";
	rule.walkDecls(property, (declaration) => {
		value = declaration.value.replace(/\s+/g, " ").trim();
	});
	return value;
}

function findRule(rules: Rule[], selector: string) {
	return rules.find((rule) => rule.selector.replace(/\s+/g, " ") === selector);
}

function normalizedSelector(rule: Rule) {
	return rule.selector.replace(/\s+/g, " ");
}

function rootRules() {
	const rules: Rule[] = [];
	root.walkRules((rule) => {
		if (rule.parent?.type === "atrule" && rule.parent.name === "media") return;
		rules.push(rule);
	});
	return rules;
}

describe("Sakura responsive CSS contracts", () => {
	it("scopes timeline input behavior to timeline-enabled charts", () => {
		const rules = rootRules();
		const chartSurface = findRule(
			rules,
			'[data-timeline-interaction="true"] :is(.recharts-wrapper, .recharts-surface)',
		);

		expect(declarationValue(chartSurface as Rule, "touch-action")).toBe(
			"pan-y",
		);
	});

	it("inherits the source main typography at the independent shell boundary", () => {
		const shell = findRule(rootRules(), ".sakura-shell");

		expect(declarationValue(shell as Rule, "width")).toBe("100%");
		expect(declarationValue(shell as Rule, "max-width")).toBe("1564px");
		expect(declarationValue(shell as Rule, "font-size")).toBe("13px");
		expect(declarationValue(shell as Rule, "font-weight")).toBe("600");
		expect(declarationValue(shell as Rule, "line-height")).toBe("19.5px");
	});

	it("lets overview traffic content fill the final card box", () => {
		const inner = findRule(rootRules(), ".nz-overview-direction-inner");

		expect(declarationValue(inner as Rule, "width")).toBe("100%");
		expect(declarationValue(inner as Rule, "min-width")).toBe("0");
	});

	it("uses the source desktop overview text rhythm", () => {
		const rules = rootRules();
		const copy = findRule(rules, ".nz-overview-basic-copy");
		const value = findRule(rules, ".nz-overview-basic-copy strong");

		expect(declarationValue(copy as Rule, "gap")).toBe("4px");
		expect(declarationValue(value as Rule, "line-height")).toBe("22px");
	});

	it("keeps cards borderless until pale-blue interaction feedback", () => {
		const rules = rootRules();
		const overview = findRule(rules, ".server-overview > *");
		const servers = findRule(rules, ".nz-card-row, .nz-list-row");
		const hover = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes('[data-sakura-hover-input="true"]') &&
				selector.includes(".server-overview > .nz-overview-basic-card") &&
				selector.includes(".nz-card-row") &&
				selector.endsWith(":hover")
			);
		});
		const active = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes(".nz-overview-basic-card") &&
				selector.includes(".nz-list-row") &&
				selector.endsWith(":active")
			);
		});

		expect(declarationValue(overview as Rule, "border")).toBe(
			"2px solid var(--nz-card-outline)",
		);
		expect(declarationValue(servers as Rule, "border")).toBe(
			"1px solid var(--nz-card-outline)",
		);
		const theme = findRule(rules, ".sakura-theme");
		expect(declarationValue(theme as Rule, "--nz-card-outline")).toBe(
			"transparent",
		);
		expect(declarationValue(hover as Rule, "transform")).toBe(
			"translateY(-2px)",
		);
		expect(declarationValue(hover as Rule, "border-color")).toBe(
			"var(--nz-card-outline-active)",
		);
		expect(declarationValue(hover as Rule, "box-shadow")).toBe("");
		expect(declarationValue(active as Rule, "transform")).toBe("translateY(0)");
		const highlighted = findRule(
			rules,
			".server-overview > .nz-overview-basic-card.sakura-metric-card-highlighted",
		);
		expect(declarationValue(highlighted as Rule, "border-color")).toBe(
			"var(--nz-card-outline-active)",
		);
		const lightOverviewIndex = rules.findIndex(
			(rule) =>
				normalizedSelector(rule) ===
				".light .server-overview > .nz-overview-basic-card",
		);
		const highlightedIndex = rules.indexOf(highlighted as Rule);
		expect(highlightedIndex).toBeGreaterThan(lightOverviewIndex);
		expect(normalizedSelector(hover as Rule)).not.toContain(
			".server-overview > *",
		);
		expect(declarationValue(active as Rule, "box-shadow")).toBe("");
	});

	it("gives overview sort metrics border-only toggle feedback", () => {
		const rules = rootRules();
		const base = findRule(rules, ".nz-overview-direction-metric");
		const selected = findRule(rules, ".nz-overview-direction-metric.active");
		const pressed = findRule(rules, ".nz-overview-direction-metric:active");
		const darkFill = findRule(rules, ".dark .nz-overview-direction-metric");

		expect(declarationValue(base as Rule, "background")).toBe("transparent");
		expect(darkFill).toBeUndefined();
		expect(declarationValue(selected as Rule, "transform")).toBe(
			"translateY(-2px)",
		);
		expect(declarationValue(selected as Rule, "border-color")).toBe(
			"var(--nz-card-outline-active)",
		);
		expect(declarationValue(selected as Rule, "background")).toBe("");
		expect(declarationValue(selected as Rule, "box-shadow")).toBe("");
		expect(declarationValue(pressed as Rule, "transform")).toBe(
			"translateY(0)",
		);
		const label = findRule(rules, ".nz-overview-direction-metric span");
		expect(declarationValue(label as Rule, "overflow")).toBe("");
		expect(declarationValue(label as Rule, "text-overflow")).toBe("");
	});

	it("shares one light-dark state palette across toolbar controls", () => {
		const rules = rootRules();
		const lightToolbar = findRule(rules, ".server-overview-controls");
		const darkToolbar = findRule(rules, ".dark .server-overview-controls");
		const toolState = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes(".sakura-tool-button:hover") &&
				selector.includes(".sakura-tool-button.active")
			);
		});
		const darkToolOverride = rules.find((rule) =>
			normalizedSelector(rule).includes(".dark .sakura-tool-button.active"),
		);

		expect(
			declarationValue(lightToolbar as Rule, "--nz-toolbar-state-bg"),
		).toBe("rgb(37 99 235 / 0.82)");
		expect(
			declarationValue(darkToolbar as Rule, "--nz-toolbar-state-bg"),
		).toContain("linear-gradient");
		expect(declarationValue(toolState as Rule, "background")).toBe(
			"var(--nz-toolbar-state-bg)",
		);
		expect(declarationValue(toolState as Rule, "border-color")).toBe(
			"var(--nz-toolbar-state-border)",
		);
		expect(declarationValue(toolState as Rule, "box-shadow")).toBe(
			"var(--nz-toolbar-state-shadow)",
		);
		expect(darkToolOverride).toBeUndefined();
	});

	it("uses the final toolbar flex structure without auto-margin compensation", () => {
		const rules = rootRules();
		const primary = findRule(rules, ".sakura-toolbar-primary");
		const groups = findRule(rules, ".sakura-groups");
		const mobilePrimary = findRule(
			mediaRules("(max-width: 768px)"),
			".sakura-toolbar-primary",
		);

		expect(declarationValue(primary as Rule, "display")).toBe("inline-flex");
		expect(declarationValue(primary as Rule, "width")).toBe("auto");
		expect(declarationValue(primary as Rule, "flex")).toBe("0 1 auto");
		expect(declarationValue(groups as Rule, "margin-right")).toBe("0");
		expect(declarationValue(mobilePrimary as Rule, "width")).toBe("0");
		expect(declarationValue(mobilePrimary as Rule, "flex")).toBe("1 1 0");
	});

	it("keeps source touch highlighting disabled only for mobile toolbar controls", () => {
		const touchRules = mediaRules(
			"(max-width: 768px) and (hover: none) and (any-hover: none)",
		);
		const touchTargets = touchRules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes(".server-overview > *") &&
				selector.includes(".sakura-tool-button") &&
				selector.includes(".sakura-sort-menu-item")
			);
		});

		expect(
			declarationValue(touchTargets as Rule, "-webkit-tap-highlight-color"),
		).toBe("transparent");
		expect(normalizedSelector(touchTargets as Rule)).not.toContain(
			".nz-card-row",
		);
	});

	it("keeps the clock label and digits on one typographic baseline", () => {
		const rules = rootRules();
		const clock = findRule(rules, ".nz-overview-clock");
		const label = findRule(rules, ".nz-overview-clock > span");
		const digits = findRule(rules, ".nz-overview-clock .sakura-clock-digits");
		const detailSpacing = findRule(
			rules,
			".header-timer:has(+ .sakura-detail-view)",
		);

		expect(declarationValue(clock as Rule, "font-size")).toBe("13px");
		expect(declarationValue(clock as Rule, "font-weight")).toBe("500");
		expect(declarationValue(clock as Rule, "line-height")).toBe("18px");
		expect(declarationValue(clock as Rule, "align-items")).toBe("baseline");
		expect(declarationValue(clock as Rule, "opacity")).toBe("0.62");
		expect(declarationValue(label as Rule, "font-size")).toBe("13px");
		expect(declarationValue(label as Rule, "font-weight")).toBe("500");
		expect(declarationValue(label as Rule, "line-height")).toBe("18px");
		expect(declarationValue(digits as Rule, "font-size")).toBe("13px");
		expect(declarationValue(digits as Rule, "font-weight")).toBe("500");
		expect(declarationValue(digits as Rule, "line-height")).toBe("18px");
		expect(declarationValue(detailSpacing as Rule, "margin-bottom")).toBe(
			"32px",
		);
	});

	it("keeps status badges bounded while allowing long languages to expand", () => {
		const rules = rootRules();
		const status = findRule(rules, ".nz-card-row .sakura-card-status");
		const longStatus = rules.find(
			(rule) =>
				normalizedSelector(rule).includes('[data-sakura-ui-lang="ru"]') &&
				normalizedSelector(rule).endsWith(".nz-card-row .sakura-card-status"),
		);

		expect(declarationValue(status as Rule, "max-width")).toBe("78px");
		expect(declarationValue(status as Rule, "text-overflow")).toBe("ellipsis");
		expect(declarationValue(longStatus as Rule, "min-width")).toBe("62px");
		expect(declarationValue(longStatus as Rule, "max-width")).toBe("112px");
		expect(declarationValue(longStatus as Rule, "font-size")).toBe("10px");
	});

	it("applies long-language card metadata through the base font variable", () => {
		const rules = rootRules();
		const metadata = findRule(
			rules,
			".sakura-server-grid:not(.sakura-server-list) .nz-card-row .sakura-card-title-meta",
		);
		const longLanguage = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes('[data-sakura-ui-lang="ru"]') &&
				selector.endsWith(".sakura-theme")
			);
		});

		expect(declarationValue(metadata as Rule, "font-size")).toBe(
			"var(--sakura-card-title-meta-font-size, 12px)",
		);
		expect(
			declarationValue(
				longLanguage as Rule,
				"--sakura-card-title-meta-font-size",
			),
		).toBe("11px");
	});

	it("keeps one final list-row layout instead of an overridden grid draft", () => {
		const rules = rootRules();
		const obsoleteListRule = findRule(rules, ".nz-list-row");
		const finalListRule = findRule(
			rules,
			".sakura-server-list .sakura-server-tile.wide",
		);
		const listBody = findRule(rules, ".sakura-list-body");
		const listMetrics = findRule(rules, ".sakura-list-metric:nth-child(n + 3)");

		expect(obsoleteListRule).toBeUndefined();
		expect(declarationValue(finalListRule as Rule, "display")).toBe("flex");
		expect(declarationValue(finalListRule as Rule, "min-width")).toBe("1180px");
		expect(declarationValue(finalListRule as Rule, "height")).toBe("90px");
		expect(declarationValue(finalListRule as Rule, "border-radius")).toBe(
			"8px",
		);
		expect(declarationValue(listBody as Rule, "height")).toBe("70px");
		expect(declarationValue(listBody as Rule, "grid-template-rows")).toBe(
			"34px 20px 14px",
		);
		expect(declarationValue(listMetrics as Rule, "min-height")).toBe("70px");
		expect(
			rules.some((rule) =>
				normalizedSelector(rule).endsWith(
					'[data-sakura-has-cycle-transfer="true"] .sakura-list-body',
				),
			),
		).toBe(false);
	});

	it("uses the source breakpoints for overview and mobile layout", () => {
		const mediaParams: string[] = [];
		root.walkAtRules("media", (atRule) => {
			mediaParams.push(atRule.params);
		});

		expect(mediaParams).toContain("(min-width: 640px)");
		expect(mediaParams).toContain("(min-width: 1024px)");
		expect(mediaParams).toContain("(max-width: 768px)");
		expect(mediaParams).toContain("(min-width: 900px), (max-width: 768px)");
		expect(mediaParams).not.toContain("(max-width: 900px)");
	});

	it("uses the source mobile overview flow instead of a scaled desktop card", () => {
		const mobileRules = mediaRules("(max-width: 768px)");
		const header = findRule(mobileRules, ".sakura-header.header-top");
		const overviewCard = findRule(mobileRules, ".server-overview > *");
		const overviewCopy = findRule(mobileRules, ".nz-overview-basic-copy");
		const illustration = findRule(mobileRules, ".nz-overview-illustration");

		expect(declarationValue(header as Rule, "margin-bottom")).toBe("64px");
		expect(declarationValue(overviewCard as Rule, "height")).toBe("86px");
		expect(declarationValue(overviewCopy as Rule, "flex-direction")).toBe(
			"row",
		);
		expect(declarationValue(illustration as Rule, "width")).toBe("72px");
		expect(declarationValue(illustration as Rule, "height")).toBe("92px");
	});

	it("places authentication and custom links on the official mobile second row", () => {
		const mobileRules = mediaRules("(max-width: 768px)");
		const desktopLinks = findRule(
			mobileRules,
			".sakura-brand-text span, .sakura-header-desktop-links",
		);
		const mobileLinks = findRule(mobileRules, ".sakura-header-mobile-links");
		const onlinePill = findRule(mobileRules, ".sakura-online-pill");

		expect(declarationValue(desktopLinks as Rule, "display")).toBe("none");
		expect(declarationValue(mobileLinks as Rule, "display")).toBe("flex");
		expect(declarationValue(mobileLinks as Rule, "min-height")).toBe("20px");
		expect(declarationValue(onlinePill as Rule, "height")).toBe("36px");
	});

	it("lets card shells shrink with their responsive grid tracks", () => {
		let cardRule: Rule | undefined;
		root.walkRules(".nz-card-row", (rule) => {
			if (rule.parent?.type === "atrule" && rule.parent.name === "media")
				return;
			cardRule = rule;
		});

		expect(cardRule).toBeDefined();
		expect(declarationValue(cardRule as Rule, "width")).toBe(
			"min(100%, 340px)",
		);

		const mobileGrid = mediaRules("(max-width: 768px)").find((rule) =>
			rule.selectors?.includes(".server-card-list"),
		);
		expect(mobileGrid).toBeDefined();
		expect(declarationValue(mobileGrid as Rule, "grid-template-columns")).toBe(
			"minmax(280px, min(340px, calc(100vw - 32px)))",
		);
	});

	it("limits long-language compaction to system and uptime cells", () => {
		const sourceRules = mediaRules("(min-width: 900px), (max-width: 768px)");
		const compactRule = sourceRules.find((rule) =>
			rule.selector.includes(".sakura-list-system"),
		);

		expect(compactRule).toBeDefined();
		expect(compactRule?.selector).not.toMatch(
			/\.sakura-list-metrics\s+:is\(span, small, strong\)/,
		);
		expect(compactRule?.selector).not.toContain(
			".sakura-list-system-copy strong",
		);
	});

	it("keeps one list body height while moving tags up when cycle data is absent", () => {
		const rules = rootRules();
		const baseContent = findRule(rules, ".sakura-list-body");
		const cycleContent = rules.find((rule) =>
			normalizedSelector(rule).endsWith(
				'.sakura-server-tile[data-sakura-has-cycle-transfer="true"] .sakura-list-body',
			),
		);
		const baseTags = findRule(rules, ".sakura-list-body > .sakura-plan-row");
		const cycleTags = rules.find(
			(rule) =>
				normalizedSelector(rule).includes(
					'.sakura-server-tile[data-sakura-has-cycle-transfer="true"]',
				) && normalizedSelector(rule).includes("> .sakura-plan-row"),
		);

		expect(declarationValue(baseContent as Rule, "height")).toBe("70px");
		expect(cycleContent).toBeUndefined();
		expect(declarationValue(baseTags as Rule, "grid-row")).toBe("2");
		expect(declarationValue(cycleTags as Rule, "grid-row")).toBe("3");
	});

	it("keeps finite and infinite list traffic bars on their source variants", () => {
		const rules = rootRules();
		const cycle = findRule(
			rules,
			".sakura-server-list .sakura-list-cycle-transfer",
		);
		const finiteFill = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes(":not(.nz-list-cycle-infinite)") &&
				selector.endsWith(".sakura-list-cycle-bar i")
			);
		});
		const infiniteFill = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes(".nz-list-cycle-infinite") &&
				!selector.includes(":not(.nz-list-cycle-infinite)") &&
				selector.endsWith(".sakura-list-cycle-bar i")
			);
		});

		expect(declarationValue(cycle as Rule, "grid-template-rows")).toBe(
			"auto 4px",
		);
		expect(declarationValue(finiteFill as Rule, "background")).toBe(
			"linear-gradient(90deg, #10d68c 0%, #e7c63d 62%, #ef4444 100%)",
		);
		expect(declarationValue(infiniteFill as Rule, "background")).toBe(
			"linear-gradient(90deg, #2dd4bf, #38bdf8, #818cf8)",
		);
		expect(declarationValue(infiniteFill as Rule, "opacity")).toBe("0.62");
	});

	it("shares the final billing treatment with list expiry bars", () => {
		const rules = rootRules();
		const lightTrack = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes(".sakura-billing-bar") &&
				selector.includes(".sakura-list-expire-bar") &&
				!selector.includes(" i") &&
				!selector.startsWith(".dark") &&
				declarationValue(rule, "box-shadow").includes("rgb(15 23 42 / 0.06)")
			);
		});
		const fill = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes(".sakura-billing-bar i") &&
				selector.includes(".sakura-list-expire-bar i") &&
				declarationValue(rule, "box-shadow").includes("--nz-expire-glow")
			);
		});

		expect(declarationValue(lightTrack as Rule, "background")).toContain(
			"rgb(255 255 255 / 0.52)",
		);
		expect(declarationValue(fill as Rule, "background")).toContain(
			"var(--nz-expire-fill, #22c55e)",
		);
	});

	it("moves card billing rows up only when cycle traffic is absent", () => {
		const rules = rootRules();
		const baseBusiness = findRule(rules, ".nz-card-row .sakura-card-business");
		const cycleBusiness = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes('[data-sakura-has-cycle-transfer="true"]') &&
				selector.endsWith(".sakura-card-business") &&
				declarationValue(rule, "grid-template-rows") === "24px 13px 5px"
			);
		});
		const baseRemaining = findRule(
			rules,
			".nz-card-row .sakura-card-business > .nz-footer-remaining",
		);
		const basePrice = findRule(
			rules,
			".nz-card-row .sakura-card-business > .nz-footer-price",
		);
		const baseBar = findRule(
			rules,
			".nz-card-row .sakura-card-business > .sakura-billing-bar",
		);
		const cycleBilling = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes('[data-sakura-has-cycle-transfer="true"]') &&
				selector.endsWith(":is(.nz-footer-remaining, .nz-footer-price)") &&
				declarationValue(rule, "grid-row") === "2"
			);
		});
		const cycleBar = rules.find((rule) => {
			const selector = normalizedSelector(rule);
			return (
				selector.includes('[data-sakura-has-cycle-transfer="true"]') &&
				selector.endsWith("> .sakura-billing-bar")
			);
		});

		expect(declarationValue(baseBusiness as Rule, "min-height")).toBe("16px");
		expect(declarationValue(baseBusiness as Rule, "max-height")).toBe("34px");
		expect(declarationValue(baseBusiness as Rule, "grid-template-rows")).toBe(
			"auto 4px",
		);
		expect(declarationValue(baseBusiness as Rule, "gap")).toBe("1px 10px");
		expect(declarationValue(baseBusiness as Rule, "padding")).toBe("4px 8px");
		expect(declarationValue(cycleBusiness as Rule, "min-height")).toBe("56px");
		expect(declarationValue(cycleBusiness as Rule, "max-height")).toBe("58px");
		expect(declarationValue(cycleBusiness as Rule, "gap")).toBe("2px 10px");
		expect(declarationValue(cycleBusiness as Rule, "padding")).toBe(
			"5px 8px 4px",
		);
		expect(declarationValue(baseRemaining as Rule, "grid-row")).toBe("1");
		expect(declarationValue(basePrice as Rule, "grid-row")).toBe("1");
		expect(declarationValue(baseBar as Rule, "grid-row")).toBe("2");
		expect(declarationValue(baseBar as Rule, "height")).toBe("4px");
		expect(declarationValue(cycleBilling as Rule, "grid-row")).toBe("2");
		expect(declarationValue(cycleBar as Rule, "grid-row")).toBe("3");
		expect(declarationValue(cycleBar as Rule, "height")).toBe("5px");
	});
});
