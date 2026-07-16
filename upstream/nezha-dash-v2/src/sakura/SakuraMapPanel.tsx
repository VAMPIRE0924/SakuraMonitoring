import { useSakuraRuntimeConfig } from "@/hooks/use-sakura-config";
import SakuraGlobe from "@/sakura/SakuraGlobe";
import type { NezhaServer } from "@/types/nezha-api";

export default function SakuraMapPanel({
	now,
	onOpenServer,
	serverList,
}: {
	now: number;
	onOpenServer?: (serverId: number) => void;
	serverList: NezhaServer[];
}) {
	const { forceUseSvgFlag } = useSakuraRuntimeConfig();

	return (
		<section className="sakura-map-panel">
			<SakuraGlobe
				forceUseSvgFlag={forceUseSvgFlag}
				now={now}
				onOpenServer={(serverId) => onOpenServer?.(serverId)}
				serverList={serverList}
			/>
		</section>
	);
}
