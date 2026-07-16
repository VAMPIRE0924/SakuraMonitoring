import { formatBytes } from "@/lib/format";

export function formatSakuraBytes(bytes: number, decimals = 2) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes";

	const [value, unit] = formatBytes(bytes, decimals).split(" ");
	return `${Number(value)} ${unit}`;
}
