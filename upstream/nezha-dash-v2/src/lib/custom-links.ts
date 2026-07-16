import { readSafeUrl } from "@/lib/sakura-config";

interface CustomLink {
	link: string;
	name: string;
}

export function parseCustomLinks(value: unknown): CustomLink[] {
	if (typeof value !== "string" || !value.trim()) return [];

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];

		return parsed.flatMap((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) return [];
			const link = readSafeUrl(Reflect.get(item, "link"));
			const rawName = Reflect.get(item, "name");
			const name = typeof rawName === "string" ? rawName.trim() : "";
			return link && name ? [{ link, name }] : [];
		});
	} catch {
		return [];
	}
}
