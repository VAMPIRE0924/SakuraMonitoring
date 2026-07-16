import { useEffect, useRef } from "react";
import { getStoredItem } from "@/lib/browser-storage";

export function useRestoreMainPageScroll(ready: boolean) {
	const hasRestored = useRef(false);

	useEffect(() => {
		if (hasRestored.current || !ready) return;

		const isFromMainPage =
			getStoredItem("sessionStorage", "fromMainPage") === "true";
		const savedPosition = getStoredItem("sessionStorage", "scrollPosition");
		const scrollTop = savedPosition ? Number(savedPosition) : Number.NaN;
		if (!isFromMainPage || !Number.isFinite(scrollTop)) return;

		hasRestored.current = true;
		let innerFrame = 0;
		const outerFrame = requestAnimationFrame(() => {
			innerFrame = requestAnimationFrame(() => {
				window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
			});
		});

		return () => {
			cancelAnimationFrame(outerFrame);
			if (innerFrame) cancelAnimationFrame(innerFrame);
		};
	}, [ready]);
}
