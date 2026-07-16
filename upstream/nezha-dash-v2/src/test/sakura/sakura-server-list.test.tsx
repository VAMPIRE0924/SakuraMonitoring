import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SakuraServerList } from "@/sakura/SakuraServerList";
import { buildServerViews } from "@/sakura/sakura-data";
import { createServer } from "@/test/fixtures";

const virtualizerState = vi.hoisted(() => ({ count: 0 }));

vi.mock("@tanstack/react-virtual", () => ({
	useWindowVirtualizer: (options: {
		count: number;
		gap: number;
		estimateSize: () => number;
		scrollMargin: number;
	}) => {
		virtualizerState.count = options.count;
		const size = options.estimateSize();
		return {
			getTotalSize: () =>
				options.count > 0
					? options.count * size + (options.count - 1) * options.gap
					: 0,
			getVirtualItems: () =>
				Array.from({ length: Math.min(2, options.count) }, (_, index) => ({
					index,
					key: index,
					start: options.scrollMargin + index * (size + options.gap),
				})),
			measureElement: vi.fn(),
		};
	},
}));

function createViews(count: number) {
	return buildServerViews({
		cycles: {},
		now: Date.parse("2025-01-01T00:00:20.000Z"),
		servers: Array.from({ length: count }, (_, index) =>
			createServer({ id: index + 1, name: `S-${index + 1}` }),
		),
		translate: (key) => key,
	});
}

describe("SakuraServerList virtualization", () => {
	it("keeps small source-sized lists on the direct layout path", () => {
		const { container } = render(
			<MemoryRouter>
				<SakuraServerList
					fixedName={true}
					forceUseSvgFlag={true}
					servers={createViews(36)}
					showNetTransfer={true}
					viewMode="grid"
				/>
			</MemoryRouter>,
		);

		expect(container.querySelector(".sakura-server-virtualized")).toBeNull();
		expect(container.querySelectorAll(".nz-card-row")).toHaveLength(36);
		expect(virtualizerState.count).toBe(0);
	});

	it("renders only visible rows for large host inventories", () => {
		const { container } = render(
			<MemoryRouter>
				<SakuraServerList
					fixedName={true}
					forceUseSvgFlag={true}
					servers={createViews(1_000)}
					showNetTransfer={true}
					viewMode="list"
				/>
			</MemoryRouter>,
		);

		expect(
			container.querySelector(".sakura-server-virtualized"),
		).not.toBeNull();
		expect(virtualizerState.count).toBe(1_000);
		expect(container.querySelectorAll(".nz-list-row")).toHaveLength(2);
	});
});
