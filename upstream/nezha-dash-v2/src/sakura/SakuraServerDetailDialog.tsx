import { useTranslation } from "react-i18next";
import ServerDetailView from "@/components/ServerDetailView";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";

export default function SakuraServerDetailDialog({
	onClose,
	serverId,
}: {
	onClose: () => void;
	serverId: number;
}) {
	const { t } = useTranslation();

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sakura-server-detail-dialog"
				overlayClassName="sakura-server-detail-overlay"
			>
				<DialogTitle className="sr-only">
					{t("common.serverDetail")}
				</DialogTitle>
				<DialogDescription className="sr-only">
					{t("common.serverMonitoringDetail")}
				</DialogDescription>
				<ServerDetailView embedded serverId={String(serverId)} />
			</DialogContent>
		</Dialog>
	);
}
