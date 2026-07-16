import { useEffect } from "react";

const HOVER_INPUT_ATTR = "sakuraHoverInput";

function setHoverInput(enabled: boolean) {
	document.documentElement.dataset[HOVER_INPUT_ATTR] = enabled
		? "true"
		: "false";
}

export function useSakuraPointerInput() {
	useEffect(() => {
		let touchLockUntil = 0;

		const markTouch = () => {
			touchLockUntil = Date.now() + 120;
			setHoverInput(false);
		};

		const syncPointer = (event: Event) => {
			const pointerType = "pointerType" in event ? event.pointerType : "";

			if (pointerType === "touch") {
				markTouch();
				return;
			}

			if (
				(pointerType === "mouse" || pointerType === "pen") &&
				Date.now() > touchLockUntil
			) {
				setHoverInput(true);
			}
		};

		setHoverInput(
			Boolean(
				window.matchMedia?.("(hover: hover) and (pointer: fine)").matches,
			),
		);

		const pointerEvents = [
			"pointerover",
			"pointermove",
			"pointerdown",
			"pointerup",
			"pointercancel",
		];
		const touchEvents = ["touchstart", "touchend", "touchcancel"];

		for (const eventName of pointerEvents) {
			document.addEventListener(eventName, syncPointer, true);
		}
		for (const eventName of touchEvents) {
			document.addEventListener(eventName, markTouch, true);
		}

		return () => {
			for (const eventName of pointerEvents) {
				document.removeEventListener(eventName, syncPointer, true);
			}
			for (const eventName of touchEvents) {
				document.removeEventListener(eventName, markTouch, true);
			}
			delete document.documentElement.dataset[HOVER_INPUT_ATTR];
		};
	}, []);
}
