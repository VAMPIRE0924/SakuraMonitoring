import { createContext } from "react";
import type { NezhaWebsocketResponse } from "@/types/nezha-api";

export type WebSocketConnectionState =
	| "connecting"
	| "connected"
	| "disconnected";

export interface WebSocketContextType {
	lastData: NezhaWebsocketResponse | null;
	connected: boolean;
	connectionState: WebSocketConnectionState;
	messageHistory: NezhaWebsocketResponse[];
	reconnect: () => void;
	needReconnect: boolean;
	setNeedReconnect: (needReconnect: boolean) => void;
}

export const WebSocketContext = createContext<WebSocketContextType | undefined>(
	undefined,
);
