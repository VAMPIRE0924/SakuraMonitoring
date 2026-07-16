import { describe, expect, it } from "vitest";
import { sortServerItems } from "@/lib/server-sort";
import { createServer } from "@/test/fixtures";

function item(
	id: number,
	name: string,
	online: boolean,
	state: Partial<ReturnType<typeof createServer>["state"]> = {},
	host: Partial<ReturnType<typeof createServer>["host"]> = {},
) {
	const base = createServer({ id, name });
	return {
		online,
		server: {
			...base,
			host: { ...base.host, ...host },
			state: { ...base.state, ...state },
		},
	};
}

describe("sortServerItems", () => {
	it("keeps stable source order while moving offline servers behind online servers", () => {
		const items = [item(1, "B", false), item(2, "A", true), item(3, "C", true)];

		expect(
			sortServerItems(items, "default", "desc").map((x) => x.server.id),
		).toEqual([2, 3, 1]);
	});

	it("allows name sorting to include offline servers normally", () => {
		const items = [item(1, "B", true), item(2, "A", false), item(3, "C", true)];

		expect(
			sortServerItems(items, "name", "asc").map((x) => x.server.name),
		).toEqual(["A", "B", "C"]);
	});

	it("sorts usage by percentage instead of raw bytes", () => {
		const items = [
			item(1, "small", true, { mem_used: 80 }, { mem_total: 100 }),
			item(2, "large", true, { mem_used: 400 }, { mem_total: 1000 }),
		];

		expect(
			sortServerItems(items, "mem", "asc").map((x) => x.server.name),
		).toEqual(["large", "small"]);
	});

	it("keeps offline servers behind online servers for metric sorts", () => {
		const items = [
			item(1, "offline-fast", false, { net_out_transfer: 999 }),
			item(2, "online-slow", true, { net_out_transfer: 1 }),
			item(3, "online-fast", true, { net_out_transfer: 10 }),
		];

		expect(
			sortServerItems(items, "up total", "desc").map((x) => x.server.name),
		).toEqual(["online-fast", "online-slow", "offline-fast"]);
	});
});
