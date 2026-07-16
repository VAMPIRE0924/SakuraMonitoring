type ServiceVisibility = "default" | "network" | "service";
type ServicePanel = Exclude<ServiceVisibility, "default">;

const SERVICE_VISIBILITY_MARKER = /\s*\[(network|service)\]$/i;

export function parseServiceName(value: string) {
	const originalName = value.trim();
	const match = SERVICE_VISIBILITY_MARKER.exec(originalName);
	if (!match) {
		return { name: originalName, visibility: "default" };
	}

	const name = originalName.slice(0, match.index).trim();
	return {
		name,
		visibility: match[1].toLowerCase() as Exclude<ServiceVisibility, "default">,
	};
}

export function getServiceNameForPanel(value: string, panel: ServicePanel) {
	const parsed = parseServiceName(value);
	return parsed.visibility === "default" || parsed.visibility === panel
		? parsed.name
		: null;
}
