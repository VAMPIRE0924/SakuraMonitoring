import { lazy, Suspense, useState } from "react";
import OnlineHistorySkeleton from "@/components/loading/OnlineHistorySkeleton";
import NetworkChartLoading from "@/components/NetworkChartLoading";
import ServerDetailChart from "@/components/ServerDetailChart";
import ServerDetailOverview from "@/components/ServerDetailOverview";
import TabSwitch from "@/components/TabSwitch";
import { Separator } from "@/components/ui/separator";

const NetworkChart = lazy(() =>
	import("@/components/NetworkChart").then((module) => ({
		default: module.NetworkChart,
	})),
);

const ServerDetailOnlineHistory = lazy(
	() => import("./ServerDetailOnlineHistory"),
);

const DETAIL_TABS = ["Detail", "Network", "Online"];

export default function ServerDetailView({
	embedded = false,
	serverId,
}: {
	embedded?: boolean;
	serverId: string;
}) {
	const [currentTab, setCurrentTab] = useState(DETAIL_TABS[0]);

	return (
		<div className="sakura-detail-view mx-auto">
			<ServerDetailOverview embedded={embedded} server_id={serverId} />
			<section className="sakura-detail-tabs my-2 flex w-full items-center">
				<Separator className="flex-1" />
				<div className="flex w-full max-w-72 justify-center">
					<TabSwitch
						tabs={DETAIL_TABS}
						currentTab={currentTab}
						setCurrentTab={setCurrentTab}
					/>
				</div>
				<Separator className="flex-1" />
			</section>

			{currentTab === DETAIL_TABS[0] && (
				<ServerDetailChart server_id={serverId} />
			)}
			{currentTab === DETAIL_TABS[1] && (
				<Suspense fallback={<NetworkChartLoading />}>
					<NetworkChart server_id={Number(serverId)} />
				</Suspense>
			)}
			{currentTab === DETAIL_TABS[2] && (
				<Suspense fallback={<OnlineHistorySkeleton />}>
					<ServerDetailOnlineHistory key={serverId} server_id={serverId} />
				</Suspense>
			)}
		</div>
	);
}
