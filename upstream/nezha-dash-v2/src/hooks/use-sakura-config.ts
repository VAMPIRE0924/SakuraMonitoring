import { useEffect, useState } from "react";
import {
	getSakuraRuntimeConfig,
	SAKURA_CONFIG_CHANGE_EVENT,
	type SakuraRuntimeConfig,
} from "@/lib/sakura-config";

export function useSakuraRuntimeConfig(): SakuraRuntimeConfig {
	const [config, setConfig] = useState(() => getSakuraRuntimeConfig());

	useEffect(() => {
		const handleConfigChange = () => {
			setConfig(getSakuraRuntimeConfig());
		};

		window.addEventListener(SAKURA_CONFIG_CHANGE_EVENT, handleConfigChange);

		return () => {
			window.removeEventListener(
				SAKURA_CONFIG_CHANGE_EVENT,
				handleConfigChange,
			);
		};
	}, []);

	return config;
}
