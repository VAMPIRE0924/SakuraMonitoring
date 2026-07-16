import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import ServerDetailView from "@/components/ServerDetailView";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import SakuraHeaderTimer from "@/sakura/SakuraHeaderTimer";

export default function SakuraServerDetail() {
	useEffect(() => {
		window.scrollTo({ top: 0, left: 0, behavior: "auto" });
	}, []);

	const { id: serverId } = useParams();
	const numericServerId = Number(serverId);
	const { lastData } = useWebSocketContext();

	if (
		!serverId ||
		!Number.isSafeInteger(numericServerId) ||
		numericServerId <= 0
	) {
		return <Navigate to="/error" replace />;
	}
	if (
		lastData &&
		!lastData.servers.some((server) => server.id === numericServerId)
	) {
		return <Navigate to="/error" replace />;
	}

	return (
		<>
			<SakuraHeaderTimer />
			<ServerDetailView serverId={serverId} />
		</>
	);
}
