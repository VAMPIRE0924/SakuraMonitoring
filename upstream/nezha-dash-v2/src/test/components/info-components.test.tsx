import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ServerFlag, { ResolvedServerFlag } from "@/components/ServerFlag";
import { notifySakuraRuntimeConfigChanged } from "@/lib/sakura-config";

function mockEmojiCanvasSupport() {
	const originalCreateElement = document.createElement.bind(document);
	const canvasContext = {
		fillStyle: "",
		textBaseline: "",
		font: "",
		fillText: vi.fn(),
		getImageData: vi.fn(() => ({
			data: new Uint8ClampedArray([0, 0, 0, 255]),
		})),
	} as unknown as CanvasRenderingContext2D;

	vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
		if (tagName === "canvas") {
			return {
				getContext: vi.fn(() => canvasContext),
			} as unknown as HTMLCanvasElement;
		}

		return originalCreateElement(tagName, options);
	});
}

describe("ServerFlag", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		Reflect.deleteProperty(window, "ForceUseSvgFlag");
	});

	it("normalizes SVG flag resources and ignores invalid country codes", async () => {
		window.ForceUseSvgFlag = true;
		const { container, rerender } = render(<ServerFlag country_code="US" />);

		await waitFor(() =>
			expect(container.querySelector(".sakura-flag-image")).toHaveAttribute(
				"src",
				expect.stringContaining("flag-icons-us"),
			),
		);
		rerender(<ServerFlag country_code="u" />);
		expect(container).toBeEmptyDOMElement();
	});

	it("syncs runtime flag-mode changes after mount", async () => {
		window.ForceUseSvgFlag = false;
		mockEmojiCanvasSupport();
		const { container } = render(
			<>
				<ServerFlag country_code="us" />
				<ServerFlag country_code="ca" />
			</>,
		);

		await waitFor(() => expect(container).toHaveTextContent("🇺🇸🇨🇦"));
		expect(
			vi
				.mocked(document.createElement)
				.mock.calls.filter(([tagName]) => tagName === "canvas"),
		).toHaveLength(1);

		act(() => {
			window.ForceUseSvgFlag = true;
			notifySakuraRuntimeConfigChanged();
		});

		await waitFor(() => {
			const flags = Array.from(
				container.querySelectorAll<HTMLImageElement>(".sakura-flag-image"),
			);
			expect(flags).toHaveLength(2);
			expect(flags.map((flag) => flag.src)).toEqual([
				expect.stringContaining("flag-icons-us"),
				expect.stringContaining("flag-icons-ca"),
			]);
		});
	});

	it("supports an explicit source-level flag mode", async () => {
		window.ForceUseSvgFlag = false;
		const { container } = render(
			<ResolvedServerFlag country_code="us" forceUseSvgFlag={true} />,
		);

		await waitFor(() =>
			expect(container.querySelector(".sakura-flag-image")).toHaveAttribute(
				"src",
				expect.stringContaining("flag-icons-us"),
			),
		);
	});
});
