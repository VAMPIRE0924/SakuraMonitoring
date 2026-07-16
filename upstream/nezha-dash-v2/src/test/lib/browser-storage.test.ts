import { describe, expect, it, vi } from "vitest";
import {
	getStoredItem,
	removeStoredItem,
	setStoredItem,
} from "@/lib/browser-storage";

describe("browser storage helpers", () => {
	it("preserves local and session storage behavior", () => {
		setStoredItem("localStorage", "sakura-test", "local");
		setStoredItem("sessionStorage", "sakura-test", "session");

		expect(getStoredItem("localStorage", "sakura-test")).toBe("local");
		expect(getStoredItem("sessionStorage", "sakura-test")).toBe("session");

		removeStoredItem("localStorage", "sakura-test");
		removeStoredItem("sessionStorage", "sakura-test");
		expect(getStoredItem("localStorage", "sakura-test")).toBeNull();
		expect(getStoredItem("sessionStorage", "sakura-test")).toBeNull();
	});

	it("degrades safely when browser storage is blocked", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});

		expect(getStoredItem("localStorage", "blocked")).toBeNull();
		expect(() =>
			setStoredItem("localStorage", "blocked", "value"),
		).not.toThrow();
		expect(() => removeStoredItem("sessionStorage", "blocked")).not.toThrow();
	});
});
