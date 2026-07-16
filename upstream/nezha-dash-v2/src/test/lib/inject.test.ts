import { describe, expect, it, vi } from "vitest";

import { InjectContext } from "@/lib/inject";

describe("InjectContext", () => {
	it("injects supported resource nodes and marks them for cleanup", async () => {
		await InjectContext(`
			<meta name="x-test" content="enabled" />
			<style>.custom { color: red; }</style>
			<script>window.__injected = true;</script>
			<div id="custom-node">custom content</div>
			plain text
		`);

		expect(document.querySelector('meta[name="x-test"]')).toHaveAttribute(
			"data-injected",
			"true",
		);
		expect(document.querySelector("style[data-injected]")).toHaveTextContent(
			".custom",
		);
		expect(document.querySelector("script[data-injected]")).toHaveTextContent(
			"window.__injected = true;",
		);
		expect(document.querySelector("#custom-node")).toHaveAttribute(
			"data-injected",
			"true",
		);
		expect(document.body).toHaveTextContent("plain text");
	});

	it("cleans previous injected resources before applying new content", async () => {
		await InjectContext(`<div id="first">first</div>first text`);
		await InjectContext(`<div id="second">second</div>`);

		expect(document.querySelector("#first")).not.toBeInTheDocument();
		expect(document.querySelector("#second")).toBeInTheDocument();
		expect(document.body).not.toHaveTextContent("first text");
	});

	it("serializes overlapping injections so the latest content wins", async () => {
		const appendChild = vi
			.spyOn(document.head, "appendChild")
			.mockImplementation((node) => {
				if (
					node instanceof HTMLScriptElement &&
					node.src.endsWith("/slow.js")
				) {
					setTimeout(() => node.dispatchEvent(new Event("load")), 10);
				}
				return node;
			});

		const first = InjectContext(`
			<script src="/slow.js"></script>
			<div id="stale-node">stale</div>
		`);
		const second = InjectContext(`<div id="latest-node">latest</div>`);

		await Promise.all([first, second]);

		expect(appendChild).toHaveBeenCalled();
		expect(document.querySelector("#stale-node")).not.toBeInTheDocument();
		expect(document.querySelector("#latest-node")).toBeInTheDocument();
	});

	it("cleans injected resources when the latest content is empty", async () => {
		await InjectContext(`<div id="removed-node">removed</div>`);
		await InjectContext("");

		expect(document.querySelector("#removed-node")).not.toBeInTheDocument();
	});

	it("runs lifecycle cleanup inside the serialized injection transaction", async () => {
		const lifecycle: string[] = [];

		await InjectContext(`<div id="replacement">next</div>`, {
			beforeInject: () => lifecycle.push("reset"),
		});

		expect(lifecycle).toEqual(["reset"]);
		expect(document.querySelector("#replacement")).toBeInTheDocument();
	});

	it("reports external resource failures without stopping injection", async () => {
		const appendChild = vi
			.spyOn(document.head, "appendChild")
			.mockImplementation((node) => {
				if (node instanceof HTMLScriptElement) {
					setTimeout(() => node.dispatchEvent(new Event("error")), 0);
				}
				return node;
			});

		const result = await InjectContext(`
			<script src="/missing.js"></script>
			<div id="after-failure">still injected</div>
		`);

		expect(appendChild).toHaveBeenCalled();
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain("/missing.js");
		expect(document.querySelector("#after-failure")).toBeInTheDocument();
	});

	it("times out stalled external resources and continues injection", async () => {
		vi.useFakeTimers();
		try {
			const injection = InjectContext(`
				<script src="/stalled.js"></script>
				<div id="after-timeout">still injected</div>
			`);

			await vi.runAllTimersAsync();
			const result = await injection;

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].message).toContain("/stalled.js");
			expect(
				document.querySelector('script[src$="/stalled.js"]'),
			).not.toBeInTheDocument();
			expect(document.querySelector("#after-timeout")).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	});
});
