import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useActiveIndicator } from "@/hooks/use-active-indicator";
import { useSakuraPointerInput } from "@/hooks/use-sakura-pointer-input";

function ActiveIndicatorProbe({
	active,
	items,
}: {
	active: string;
	items: string[];
}) {
	const { containerRef, enableIndicatorAnimation, indicator, setItemRef } =
		useActiveIndicator(items, active);

	return (
		<div>
			<div ref={containerRef}>
				{items.map((item, index) => (
					<div
						key={item}
						ref={setItemRef(index)}
						data-testid={`item-${item}`}
						onClick={enableIndicatorAnimation}
					>
						{item}
					</div>
				))}
			</div>
			<p>
				{indicator ? `${indicator.width}:${indicator.shouldAnimate}` : "none"}
			</p>
		</div>
	);
}

function SakuraPointerInputProbe() {
	useSakuraPointerInput();

	return <div>pointer</div>;
}

function dispatchPointer(type: string, pointerType: string) {
	const event = new Event(type, { bubbles: true });
	Object.defineProperty(event, "pointerType", {
		configurable: true,
		value: pointerType,
	});
	document.dispatchEvent(event);
}

describe("useActiveIndicator", () => {
	it("tracks the active item and clears when it is not available", async () => {
		Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
			configurable: true,
			get() {
				return 20;
			},
		});
		Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
			configurable: true,
			get() {
				return 10;
			},
		});

		const { rerender } = render(
			<ActiveIndicatorProbe active="One" items={["One", "Two"]} />,
		);

		expect(screen.getByText("20:false")).toBeInTheDocument();
		rerender(<ActiveIndicatorProbe active="Missing" items={["One", "Two"]} />);
		expect(screen.getByText("none")).toBeInTheDocument();
	});
});

describe("useSakuraPointerInput", () => {
	it("tracks hover-capable input and clears state on unmount", () => {
		const { unmount } = render(<SakuraPointerInputProbe />);

		expect(document.documentElement.dataset.sakuraHoverInput).toBe("false");

		dispatchPointer("pointermove", "mouse");
		expect(document.documentElement.dataset.sakuraHoverInput).toBe("true");

		document.dispatchEvent(new Event("touchstart", { bubbles: true }));
		expect(document.documentElement.dataset.sakuraHoverInput).toBe("false");

		unmount();
		expect(document.documentElement.dataset.sakuraHoverInput).toBeUndefined();
	});
});
