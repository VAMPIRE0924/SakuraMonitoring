import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";

type SakuraPageLoaderProps = {
	label?: string;
	targetProgress?: number;
};

const LOADER_RESET_DELAY_MS = 500;
const INITIAL_PROGRESS = 8;
const DEFAULT_TARGET_PROGRESS = 88;
let loaderCycleProgress = INITIAL_PROGRESS;
let loaderCycleResetTimer: number | null = null;

function normalizeTargetProgress(value: number) {
	return Math.min(100, Math.max(INITIAL_PROGRESS, Math.round(value)));
}

export function SakuraPageLoader({
	label,
	targetProgress = DEFAULT_TARGET_PROGRESS,
}: SakuraPageLoaderProps) {
	const { t } = useTranslation();
	const { loadingIllustration } = useSakuraRuntimeConfig();
	const [progress, setProgress] = useState(loaderCycleProgress);
	const normalizedTarget = normalizeTargetProgress(targetProgress);

	useEffect(() => {
		if (loaderCycleResetTimer !== null) {
			window.clearTimeout(loaderCycleResetTimer);
			loaderCycleResetTimer = null;
		}

		document.getElementById("sakura-initial-loader")?.remove();

		const timer = window.setInterval(() => {
			setProgress((current) => {
				if (current >= normalizedTarget) return current;

				const remaining = normalizedTarget - current;
				const next = Math.min(
					normalizedTarget,
					current + Math.max(1, Math.ceil(remaining / 10)),
				);
				loaderCycleProgress = next;
				return next;
			});
		}, 40);

		return () => {
			window.clearInterval(timer);
			loaderCycleResetTimer = window.setTimeout(() => {
				loaderCycleProgress = INITIAL_PROGRESS;
				loaderCycleResetTimer = null;
			}, LOADER_RESET_DELAY_MS);
		};
	}, [normalizedTarget]);

	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="sakura-page-loader"
			role="status"
		>
			<div className="sakura-page-loader-content">
				{loadingIllustration ? (
					<img
						alt=""
						aria-hidden="true"
						className="sakura-page-loader-illustration"
						decoding="async"
						fetchPriority="high"
						loading="eager"
						src={loadingIllustration}
					/>
				) : null}
				<div className="sakura-page-loader-progress">
					<div
						aria-label={label || t("info.pageLoading")}
						aria-valuemax={100}
						aria-valuemin={0}
						aria-valuenow={progress}
						className="sakura-page-loader-track"
						role="progressbar"
					>
						<span style={{ width: `${progress}%` }} />
					</div>
					<output className="sakura-page-loader-percent">{progress}%</output>
				</div>
				<strong className="sakura-page-loader-label">
					{label || t("info.pageLoading")}
				</strong>
			</div>
		</div>
	);
}
