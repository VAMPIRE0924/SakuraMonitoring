import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ErrorPage from "@/pages/ErrorPage";
import NotFound from "@/pages/NotFound";

function LocationProbe() {
	const location = useLocation();
	return <p>{location.pathname}</p>;
}

describe("active fallback pages", () => {
	it("renders explicit and translated error messages", () => {
		const { rerender } = render(<ErrorPage code={418} message="short" />);

		expect(screen.getByText("418")).toBeInTheDocument();
		expect(screen.getByText("short")).toBeInTheDocument();

		rerender(<ErrorPage />);
		expect(screen.getByText("error.somethingWentWrong")).toBeInTheDocument();
	});

	it("navigates home from the not-found page", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/missing"]}>
				<Routes>
					<Route path="/missing" element={<NotFound />} />
					<Route
						path="/"
						element={
							<>
								<p>home</p>
								<LocationProbe />
							</>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("404")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "error.backToHome" }));
		expect(screen.getByText("home")).toBeInTheDocument();
		expect(screen.getByText("/")).toBeInTheDocument();
	});
});
