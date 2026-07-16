import { type ReactNode, useMemo, useState } from "react";

import { type Status, StatusContext } from "./status-context";

export function StatusProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<Status>("all");
	const value = useMemo(() => ({ setStatus, status }), [status]);

	return (
		<StatusContext.Provider value={value}>{children}</StatusContext.Provider>
	);
}
