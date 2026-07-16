import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { SAKURA_CONFIG_CHANGE_EVENT } from "@/lib/sakura-config";
import {
	SORT_ORDERS,
	SORT_TYPES,
	SortContext,
	type SortOrder,
	type SortType,
} from "./sort-context";

const getForcedSortType = (): SortType | undefined => {
	const forcedSortType = window.ForceSortType;
	if (forcedSortType && SORT_TYPES.includes(forcedSortType as SortType)) {
		return forcedSortType as SortType;
	}
	return undefined;
};

const getForcedSortOrder = (): SortOrder | undefined => {
	const forcedSortOrder = window.ForceSortOrder;
	if (forcedSortOrder && SORT_ORDERS.includes(forcedSortOrder as SortOrder)) {
		return forcedSortOrder as SortOrder;
	}
	return undefined;
};

export function SortProvider({ children }: { children: ReactNode }) {
	const previousForcedSortType = useRef(getForcedSortType());
	const previousForcedSortOrder = useRef(getForcedSortOrder());
	const [sortType, setSortType] = useState<SortType>(
		() => previousForcedSortType.current || "default",
	);
	const [sortOrder, setSortOrder] = useState<SortOrder>(
		() => previousForcedSortOrder.current || "desc",
	);

	useEffect(() => {
		const applyForcedSort = () => {
			const forcedSortType = getForcedSortType();
			const forcedSortOrder = getForcedSortOrder();
			if (forcedSortType) {
				setSortType(forcedSortType);
			} else if (previousForcedSortType.current) {
				setSortType("default");
			}
			if (forcedSortOrder) {
				setSortOrder(forcedSortOrder);
			} else if (previousForcedSortOrder.current) {
				setSortOrder("desc");
			}
			previousForcedSortType.current = forcedSortType;
			previousForcedSortOrder.current = forcedSortOrder;
		};

		applyForcedSort();
		window.addEventListener(SAKURA_CONFIG_CHANGE_EVENT, applyForcedSort);

		return () => {
			window.removeEventListener(SAKURA_CONFIG_CHANGE_EVENT, applyForcedSort);
		};
	}, []);
	const value = useMemo(
		() => ({ setSortOrder, setSortType, sortOrder, sortType }),
		[sortOrder, sortType],
	);

	return <SortContext.Provider value={value}>{children}</SortContext.Provider>;
}
