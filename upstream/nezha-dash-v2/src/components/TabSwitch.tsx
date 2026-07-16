import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useActiveIndicator } from "@/hooks/use-active-indicator";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import { cn } from "@/lib/utils";

export default function TabSwitch({
	tabs,
	currentTab,
	setCurrentTab,
}: {
	tabs: string[];
	currentTab: string;
	setCurrentTab: (tab: string) => void;
}) {
	const { t } = useTranslation();
	const { containerRef, enableIndicatorAnimation, indicator, setItemRef } =
		useActiveIndicator(tabs, currentTab);
	const { backgroundImage } = useSakuraRuntimeConfig();
	const selectTab = (tab: string) => {
		if (currentTab !== tab) enableIndicatorAnimation();
		setCurrentTab(tab);
	};
	const handleTabKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) => {
		if (tabs.length === 0) return;

		let nextIndex = index;
		if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
		else if (event.key === "ArrowLeft") {
			nextIndex = (index - 1 + tabs.length) % tabs.length;
		} else if (event.key === "Home") nextIndex = 0;
		else if (event.key === "End") nextIndex = tabs.length - 1;
		else return;

		event.preventDefault();
		selectTab(tabs[nextIndex]);
		event.currentTarget.parentElement
			?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
			.item(nextIndex)
			.focus();
	};
	return (
		<div className="z-50 flex flex-col items-start rounded-[50px]">
			<div
				ref={containerRef}
				role="tablist"
				aria-label={t("common.serverDetailViews")}
				className={cn(
					"relative flex items-center gap-1 rounded-[50px] bg-stone-100 p-[3px] dark:bg-stone-800",
					{
						"bg-stone-100/70 dark:bg-stone-800/70": backgroundImage,
					},
				)}
			>
				{indicator && (
					<div
						className="active-indicator-fade-in absolute left-0 top-0 z-10 content-center bg-white shadow-lg shadow-black/5 dark:bg-stone-700 dark:shadow-white/5"
						style={{
							borderRadius: 46,
							height: indicator.height,
							transform: `translate(${indicator.x}px, ${indicator.y}px)`,
							transition: indicator.shouldAnimate
								? "transform 0.5s var(--timing), width 0.5s var(--timing), height 0.5s var(--timing)"
								: "none",
							width: indicator.width,
						}}
					/>
				)}
				{tabs.map((tab: string, index: number) => (
					<button
						type="button"
						role="tab"
						aria-selected={currentTab === tab}
						tabIndex={currentTab === tab ? 0 : -1}
						key={tab}
						ref={setItemRef(index)}
						onClick={() => selectTab(tab)}
						onKeyDown={(event) => handleTabKeyDown(event, index)}
						className={cn(
							"relative cursor-pointer rounded-3xl border-0 bg-transparent px-2.5 py-2 text-[13px] font-semibold [font-family:inherit] transition-all duration-500 ease-in-out hover:text-stone-950 hover:dark:text-stone-50",
							currentTab === tab
								? "text-black dark:text-white"
								: "text-stone-400 dark:text-stone-500",
						)}
					>
						<span className="relative z-20 whitespace-nowrap">
							{t(`tabSwitch.${tab}`)}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
