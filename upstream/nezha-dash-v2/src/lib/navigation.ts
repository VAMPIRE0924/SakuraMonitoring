import { setStoredItem } from "@/lib/browser-storage";

export function saveMainPageScrollPosition() {
	const scrollPosition =
		window.scrollY ||
		document.documentElement.scrollTop ||
		document.body.scrollTop ||
		0;

	setStoredItem("sessionStorage", "fromMainPage", "true");
	setStoredItem("sessionStorage", "scrollPosition", String(scrollPosition));
}
