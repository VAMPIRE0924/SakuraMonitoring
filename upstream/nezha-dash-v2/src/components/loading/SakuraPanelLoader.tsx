import { useEffect, useRef, useState } from "react";

type SakuraPanelLoaderProps = {
	label: string;
	resources: Array<"globe" | "service">;
};

const INITIAL_PROGRESS = 12;
const TARGET_PROGRESS = 92;

export function SakuraPanelLoader({
	label,
	resources,
}: SakuraPanelLoaderProps) {
	const [progress, setProgress] = useState(INITIAL_PROGRESS);
	const resourceCount = resources.length;
	const previousResourceCount = useRef(resourceCount);

	useEffect(() => {
		const previousCount = previousResourceCount.current;
		previousResourceCount.current = resourceCount;
		setProgress((current) => {
			if (resourceCount === 0) return INITIAL_PROGRESS;
			if (previousCount === resourceCount) return current;
			return Math.min(
				TARGET_PROGRESS,
				Math.max(
					INITIAL_PROGRESS,
					Math.floor((current * previousCount) / resourceCount),
				),
			);
		});

		const timer = window.setInterval(() => {
			setProgress((current) => {
				if (current >= TARGET_PROGRESS) {
					window.clearInterval(timer);
					return current;
				}
				const remaining = TARGET_PROGRESS - current;
				return Math.min(
					TARGET_PROGRESS,
					current + Math.max(1, Math.ceil(remaining / 8)),
				);
			});
		}, 120);

		return () => window.clearInterval(timer);
	}, [resourceCount]);

	return (
		<div
			aria-busy="true"
			className="sakura-panel-loader"
			data-resources={resources.join(" ")}
			role="status"
		>
			<strong className="sakura-panel-loader-label">{label}</strong>
			<div className="sakura-panel-loader-progress">
				<div
					aria-label={label}
					aria-valuemax={100}
					aria-valuemin={0}
					aria-valuenow={progress}
					className="sakura-panel-loader-track"
					role="progressbar"
				>
					<span style={{ width: `${progress}%` }} />
				</div>
				<output className="sakura-panel-loader-percent">{progress}%</output>
			</div>
		</div>
	);
}
