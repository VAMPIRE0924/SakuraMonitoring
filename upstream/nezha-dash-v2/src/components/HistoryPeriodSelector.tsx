import { type ReactNode, useMemo } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveIndicator } from "@/hooks/use-active-indicator";
import { cn } from "@/lib/utils";

export type HistoryPeriodOption<T> = {
	value: T;
	label: ReactNode;
	disabled?: boolean;
	disabledHint?: ReactNode;
};

// Shared from the detail/network period controls: one indicator, disabled style
// and tooltip wrapper for all historical views.
export default function HistoryPeriodSelector<T extends string | number>({
	options,
	selectedPeriod,
	onPeriodChange,
	className,
	testId,
}: {
	options: HistoryPeriodOption<T>[];
	selectedPeriod: T;
	onPeriodChange: (period: T) => void;
	className?: string;
	testId?: string;
}) {
	const values = useMemo(
		() => options.map((option) => option.value),
		[options],
	);
	const { containerRef, enableIndicatorAnimation, indicator, setItemRef } =
		useActiveIndicator(values, selectedPeriod);
	return (
		<TooltipProvider delayDuration={120}>
			<div
				ref={containerRef}
				data-testid={testId}
				className={cn(
					"relative flex gap-0.5 flex-wrap p-0.5 bg-muted dark:bg-muted/40 rounded-full w-fit border border-border/60 dark:border-border",
					className,
				)}
			>
				{indicator && (
					<div
						className="active-indicator-fade-in absolute left-0 top-0 z-10 bg-white dark:bg-background rounded-full ring-1 ring-border/60 dark:ring-border/40"
						style={{
							height: indicator.height,
							transform: `translate(${indicator.x}px, ${indicator.y}px)`,
							transition: indicator.shouldAnimate
								? "transform 0.5s var(--timing), width 0.5s var(--timing), height 0.5s var(--timing)"
								: "none",
							width: indicator.width,
						}}
					/>
				)}
				{options.map((option, index) => {
					const button = (
						<button
							key={option.value}
							type="button"
							disabled={option.disabled}
							aria-pressed={selectedPeriod === option.value}
							ref={setItemRef(index)}
							onClick={() => {
								if (option.disabled) return;
								if (selectedPeriod !== option.value) enableIndicatorAnimation();
								onPeriodChange(option.value);
							}}
							className={cn(
								"relative cursor-pointer appearance-none rounded-full border-0 bg-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-300",
								selectedPeriod === option.value
									? "text-foreground"
									: option.disabled
										? "text-muted-foreground"
										: "text-muted-foreground hover:text-foreground",
								option.disabled && "cursor-not-allowed opacity-40 grayscale",
							)}
						>
							<span className="relative z-20 flex items-center gap-1.5">
								{option.label}
							</span>
						</button>
					);
					return option.disabled && option.disabledHint ? (
						<Tooltip key={option.value}>
							<TooltipTrigger asChild>
								<span className="inline-flex">{button}</span>
							</TooltipTrigger>
							<TooltipContent>{option.disabledHint}</TooltipContent>
						</Tooltip>
					) : (
						button
					);
				})}
			</div>
		</TooltipProvider>
	);
}
