export function formatBytes(bytes: number, decimals = 2) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 KiB";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];

	const i = Math.min(
		sizes.length - 1,
		Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)) - 1),
	);
	const value = (bytes / k ** (i + 1)).toFixed(dm);

	return `${value} ${sizes[i]}`;
}

export function formatRate(bytesPerSecond: number, decimals = 2) {
	return `${formatBytes(bytesPerSecond, decimals)}/s`;
}
