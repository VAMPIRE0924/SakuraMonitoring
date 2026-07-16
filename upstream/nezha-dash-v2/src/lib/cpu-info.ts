const MAX_REASONABLE_CPU_COUNT = 1024;

function normalizeCpuCount(value: unknown) {
	const count = Number(value);
	if (
		!Number.isFinite(count) ||
		count <= 0 ||
		count > MAX_REASONABLE_CPU_COUNT
	) {
		return undefined;
	}

	return Math.round(count);
}

function firstCpuCount(text: string, patterns: RegExp[]) {
	for (const pattern of patterns) {
		const match = pattern.exec(text);
		const count = normalizeCpuCount(match?.[1]);
		if (count) return count;
	}

	return undefined;
}

function parseCpuCountText(value: string) {
	const text = value
		.replace(/[()]/g, " ")
		.replace(/[_/]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return undefined;

	const explicitCount = firstCpuCount(text, [
		/\b(\d+(?:\.\d+)?)\s*(?:v\s*cpus?|vcpus?|virtual\s*(?:cpus?|cores?|threads?|processors?)|logical\s*(?:cpus?|cores?|threads?|processors?))\b/i,
		/\b(?:v\s*cpus?|vcpus?|virtual\s*(?:cpus?|cores?|threads?|processors?)|logical\s*(?:cpus?|cores?|threads?|processors?)|logical\s*processors?)\s*[:\uFF1A=]?\s*(\d+(?:\.\d+)?)/i,
		/(\d+(?:\.\d+)?)\s*(?:\u865A\u62DF|\u865B\u64EC|\u903B\u8F91|\u908F\u8F2F)(?:\u6838\u5FC3|\u6838|\u7EBF\u7A0B|\u57F7\u884C\u7DD2|\u5904\u7406\u5668|\u8655\u7406\u5668)/i,
		/(?:\u865A\u62DF|\u865B\u64EC|\u903B\u8F91|\u908F\u8F2F)(?:\u6838\u5FC3|\u6838|\u7EBF\u7A0B|\u57F7\u884C\u7DD2|\u5904\u7406\u5668|\u8655\u7406\u5668)\s*[:\uFF1A=]?\s*(\d+(?:\.\d+)?)/i,
		/\b(\d+(?:\.\d+)?)\s*physical\s*(?:cpus?|cores?|threads?|processors?)\b/i,
		/\bphysical\s*(?:cpus?|cores?|threads?|processors?)\s*[:\uFF1A=]?\s*(\d+(?:\.\d+)?)/i,
		/(\d+(?:\.\d+)?)\s*\u7269\u7406(?:\u6838\u5FC3|\u6838|\u7EBF\u7A0B|\u57F7\u884C\u7DD2|\u5904\u7406\u5668|\u8655\u7406\u5668)/i,
		/\u7269\u7406(?:\u6838\u5FC3|\u6838|\u7EBF\u7A0B|\u57F7\u884C\u7DD2|\u5904\u7406\u5668|\u8655\u7406\u5668)\s*[:\uFF1A=]?\s*(\d+(?:\.\d+)?)/i,
		/\b(?:number\s*of\s*)?(?:logical\s*)?(?:cpus?|processors?|cores?|threads?|cpu\s*s?|logical\s*processors?|logical\s*cpus?|cpu\s*count|core\s*count|thread\s*count|processor\s*count|number\s*of\s*cores?|number\s*of\s*processors?)\s*[:\uFF1A=]\s*(\d+(?:\.\d+)?)/i,
		/(?:\u6838\u5FC3|\u6838|\u7EBF\u7A0B|\u57F7\u884C\u7DD2|\u5904\u7406\u5668|\u8655\u7406\u5668)\s*[:\uFF1A=]\s*(\d+(?:\.\d+)?)/i,
	]);
	if (explicitCount) return explicitCount;

	const compactCoreThread = text.match(
		/\b(\d{1,4})\s*c(?:ores?)?\s*(?:[+/]\s*)?\d{1,4}\s*t(?:hreads?)?\b/i,
	);
	const compactCount = normalizeCpuCount(compactCoreThread?.[1]);
	if (compactCount) return compactCount;

	const socketProduct = text.match(
		/\b(\d{1,3})\s*(?:x|\u00D7)\s+.*?\b(\d{1,3})\s*[- ]\s*(?:cores?|\u6838\u5FC3|\u6838)\b/i,
	);
	if (socketProduct) {
		const sockets = normalizeCpuCount(socketProduct[1]);
		const coresPerSocket = normalizeCpuCount(socketProduct[2]);
		const total =
			sockets && coresPerSocket ? sockets * coresPerSocket : undefined;
		const count = normalizeCpuCount(total);
		if (count) return count;
	}

	return firstCpuCount(text, [
		/\b(\d+(?:\.\d+)?)\s*(?:cpus?|processors?)\b/i,
		/(\d+(?:\.\d+)?)\s*(?:\u6838\u5FC3|\u6838|\u7EBF\u7A0B|\u57F7\u884C\u7DD2)/i,
		/\b(\d+(?:\.\d+)?)\s*[- ]\s*(?:cores?|threads?)\b/i,
	]);
}

export function extractCpuCoreCount(
	cpuInfo: readonly string[] | null | undefined,
) {
	const entries = Array.isArray(cpuInfo)
		? cpuInfo.filter(
				(item): item is string =>
					typeof item === "string" && Boolean(item.trim()),
			)
		: [];
	const parsed = entries
		.map(parseCpuCountText)
		.filter((count): count is number => Boolean(count));

	if (parsed.length > 0) {
		return normalizeCpuCount(parsed.reduce((total, count) => total + count, 0));
	}

	return entries.length > 1 ? normalizeCpuCount(entries.length) : undefined;
}
