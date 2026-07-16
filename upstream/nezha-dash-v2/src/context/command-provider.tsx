import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

import { CommandContext } from "./command-context";

export function CommandProvider({ children }: { children: ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);

	const openCommand = useCallback(() => setIsOpen(true), []);
	const closeCommand = useCallback(() => setIsOpen(false), []);
	const toggleCommand = useCallback(() => setIsOpen((prev) => !prev), []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "k" || (!event.metaKey && !event.ctrlKey)) return;

			event.preventDefault();
			toggleCommand();
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [toggleCommand]);
	const value = useMemo(
		() => ({ closeCommand, isOpen, openCommand, toggleCommand }),
		[closeCommand, isOpen, openCommand, toggleCommand],
	);

	return (
		<CommandContext.Provider value={value}>{children}</CommandContext.Provider>
	);
}
