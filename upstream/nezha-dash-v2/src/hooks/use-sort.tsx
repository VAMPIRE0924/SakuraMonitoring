import { useContext } from "react";
import { SortContext } from "@/context/sort-context";

export function useSort() {
	const context = useContext(SortContext);
	if (context === undefined) {
		throw new Error("useSort must be used within a SortProvider");
	}
	return context;
}
