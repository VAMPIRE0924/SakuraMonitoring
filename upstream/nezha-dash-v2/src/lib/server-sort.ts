import type { SortOrder, SortType } from "@/context/sort-context";
import type { NezhaServer } from "@/types/nezha-api";

interface SortableServerItem {
	online: boolean;
	server: NezhaServer;
}

function usagePercent(used = 0, total = 0) {
	return total > 0 ? (used / total) * 100 : 0;
}

function compareServerMetric(
	left: NezhaServer,
	right: NezhaServer,
	sortType: SortType,
) {
	switch (sortType) {
		case "name":
			return left.name.localeCompare(right.name);
		case "uptime":
			return (left.state?.uptime ?? 0) - (right.state?.uptime ?? 0);
		case "system":
			return (left.host?.platform ?? "").localeCompare(
				right.host?.platform ?? "",
			);
		case "cpu":
			return (left.state?.cpu ?? 0) - (right.state?.cpu ?? 0);
		case "mem":
			return (
				usagePercent(left.state?.mem_used, left.host?.mem_total) -
				usagePercent(right.state?.mem_used, right.host?.mem_total)
			);
		case "disk":
			return (
				usagePercent(left.state?.disk_used, left.host?.disk_total) -
				usagePercent(right.state?.disk_used, right.host?.disk_total)
			);
		case "up":
			return (
				(left.state?.net_out_speed ?? 0) - (right.state?.net_out_speed ?? 0)
			);
		case "down":
			return (left.state?.net_in_speed ?? 0) - (right.state?.net_in_speed ?? 0);
		case "up total":
			return (
				(left.state?.net_out_transfer ?? 0) -
				(right.state?.net_out_transfer ?? 0)
			);
		case "down total":
			return (
				(left.state?.net_in_transfer ?? 0) - (right.state?.net_in_transfer ?? 0)
			);
		case "traffic":
			return (
				(left.state?.net_out_transfer ?? 0) +
				(left.state?.net_in_transfer ?? 0) -
				((right.state?.net_out_transfer ?? 0) +
					(right.state?.net_in_transfer ?? 0))
			);
		case "rate":
			return (
				(left.state?.net_out_speed ?? 0) +
				(left.state?.net_in_speed ?? 0) -
				((right.state?.net_out_speed ?? 0) + (right.state?.net_in_speed ?? 0))
			);
		default:
			return 0;
	}
}

export function sortServerItems<T extends SortableServerItem>(
	items: readonly T[],
	sortType: SortType,
	sortOrder: SortOrder,
): T[] {
	return items
		.map((item, index) => ({ index, item }))
		.sort((left, right) => {
			if (sortType !== "name" && left.item.online !== right.item.online) {
				return left.item.online ? -1 : 1;
			}
			if (sortType !== "name" && !left.item.online) return 0;

			const comparison = compareServerMetric(
				left.item.server,
				right.item.server,
				sortType,
			);
			if (sortType === "default" || comparison === 0) {
				return left.index - right.index;
			}
			return sortOrder === "asc" ? comparison : -comparison;
		})
		.map(({ item }) => item);
}
