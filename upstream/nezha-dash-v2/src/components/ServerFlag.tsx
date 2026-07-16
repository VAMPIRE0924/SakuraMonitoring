import { useEffect, useState } from "react";
import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import { cn } from "@/lib/utils";

const normalizeCountryCode = (countryCode: string) =>
	countryCode.trim().replace(/_/g, "-").toUpperCase();

const svgFlagLoaders = import.meta.glob<string>(
	"../../node_modules/flag-icons/flags/4x3/*.svg",
	{ import: "default", query: "?url" },
);

function getSvgFlagLoader(countryCode: string) {
	return svgFlagLoaders[
		`../../node_modules/flag-icons/flags/4x3/${countryCode.toLowerCase()}.svg`
	];
}

function getUnicodeFlagIcon(countryCode: string) {
	return String.fromCodePoint(
		...Array.from(countryCode, (character) => character.charCodeAt(0) + 127397),
	);
}

type ServerFlagProps = {
	country_code: string;
	className?: string;
	forceUseSvgFlag: boolean;
};

let cachedEmojiFlagSupport: boolean | undefined;

function detectEmojiFlagSupport() {
	if (cachedEmojiFlagSupport !== undefined) return cachedEmojiFlagSupport;

	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) {
		cachedEmojiFlagSupport = false;
		return cachedEmojiFlagSupport;
	}

	context.fillStyle = "#000";
	context.textBaseline = "top";
	context.font = "32px Arial";
	context.fillText("🇺🇸", 0, 0);
	cachedEmojiFlagSupport = context.getImageData(16, 16, 1, 1).data[3] !== 0;
	return cachedEmojiFlagSupport;
}

export function ResolvedServerFlag({
	country_code,
	className,
	forceUseSvgFlag,
}: ServerFlagProps) {
	const [supportsEmojiFlags, setSupportsEmojiFlags] = useState(() =>
		forceUseSvgFlag
			? false
			: cachedEmojiFlagSupport === undefined
				? null
				: cachedEmojiFlagSupport,
	);
	const normalizedCountryCode = normalizeCountryCode(country_code || "");
	const canRenderEmojiFlag = /^[A-Z]{2}$/.test(normalizedCountryCode);
	const loadSvgFlag = canRenderEmojiFlag
		? getSvgFlagLoader(normalizedCountryCode)
		: undefined;
	const canRenderSvgFlag = Boolean(loadSvgFlag);
	const shouldLoadSvgFlag = forceUseSvgFlag || supportsEmojiFlags === false;
	const [svgFlagUrl, setSvgFlagUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setSvgFlagUrl(null);
		if (!shouldLoadSvgFlag || !canRenderSvgFlag || !loadSvgFlag) return;

		void loadSvgFlag().then((url) => {
			if (!cancelled) setSvgFlagUrl(url);
		});

		return () => {
			cancelled = true;
		};
	}, [canRenderSvgFlag, loadSvgFlag, shouldLoadSvgFlag]);

	useEffect(() => {
		if (forceUseSvgFlag) {
			setSupportsEmojiFlags(false);
			return;
		}

		setSupportsEmojiFlags(detectEmojiFlagSupport());
	}, [forceUseSvgFlag]);

	if (!canRenderSvgFlag) return null;

	return (
		<span className={cn("text-[12px] text-muted-foreground", className)}>
			{shouldLoadSvgFlag || !canRenderEmojiFlag ? (
				svgFlagUrl ? (
					<img
						alt=""
						aria-hidden="true"
						className="sakura-flag-image"
						src={svgFlagUrl}
					/>
				) : null
			) : supportsEmojiFlags ? (
				getUnicodeFlagIcon(normalizedCountryCode)
			) : null}
		</span>
	);
}

export default function ServerFlag({
	country_code,
	className,
}: Omit<ServerFlagProps, "forceUseSvgFlag">) {
	const { forceUseSvgFlag } = useSakuraRuntimeConfig();

	return (
		<ResolvedServerFlag
			className={className}
			country_code={country_code}
			forceUseSvgFlag={forceUseSvgFlag}
		/>
	);
}
