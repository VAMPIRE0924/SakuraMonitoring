import { Home, Moon, Sun, SunMoon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { useCommand } from "@/hooks/use-command";
import { useTheme } from "@/hooks/use-theme";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import { saveMainPageScrollPosition } from "@/lib/navigation";
import { formatNezhaInfo } from "@/lib/utils";

export function DashCommand() {
	const { isOpen, closeCommand } = useCommand();
	const [search, setSearch] = useState("");
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { setTheme } = useTheme();

	const { lastData, connected } = useWebSocketContext();

	useEffect(() => {
		if (!isOpen) setSearch("");
	}, [isOpen]);

	const shortcuts = useMemo(
		() =>
			[
				{
					keywords: ["home", "homepage"],
					icon: <Home />,
					label: t("Home"),
					action: () => navigate("/"),
				},
				{
					keywords: ["light", "theme", "lightmode"],
					icon: <Sun />,
					label: t("ToggleLightMode"),
					action: () => setTheme("light"),
				},
				{
					keywords: ["dark", "theme", "darkmode"],
					icon: <Moon />,
					label: t("ToggleDarkMode"),
					action: () => setTheme("dark"),
				},
				{
					keywords: ["system", "theme", "systemmode"],
					icon: <SunMoon />,
					label: t("ToggleSystemMode"),
					action: () => setTheme("system"),
				},
			].map((item) => ({
				...item,
				value: `${item.keywords.join(" ")} ${item.label}`,
			})),
		[navigate, setTheme, t],
	);

	const serverCommands = useMemo(() => {
		if (!isOpen || !lastData) return [];

		return (lastData.servers ?? []).map((server) => ({
			id: server.id,
			name: server.name,
			online: formatNezhaInfo(lastData.now, server).online,
		}));
	}, [isOpen, lastData]);

	if (!connected || !lastData) return null;

	return (
		<CommandDialog
			open={isOpen}
			title={t("TypeCommand")}
			onOpenChange={(open) => {
				if (!open) closeCommand();
			}}
		>
			<CommandInput
				placeholder={t("TypeCommand")}
				value={search}
				onValueChange={setSearch}
			/>
			<CommandList className="border-t">
				<CommandEmpty>{t("NoResults")}</CommandEmpty>
				{serverCommands.length > 0 && (
					<CommandGroup heading={t("Servers")}>
						{serverCommands.map((server) => (
							<CommandItem
								key={server.id}
								value={server.name}
								onSelect={() => {
									saveMainPageScrollPosition();
									navigate(`/server/${server.id}`);
									closeCommand();
								}}
							>
								{server.online ? (
									<span className="h-2 w-2 shrink-0 rounded-full bg-green-500 self-center" />
								) : (
									<span className="h-2 w-2 shrink-0 rounded-full bg-red-500 self-center" />
								)}
								<span>{server.name}</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{serverCommands.length > 0 && <CommandSeparator />}

				<CommandGroup heading={t("Shortcuts")}>
					{shortcuts.map((item) => (
						<CommandItem
							key={item.label}
							value={item.value}
							onSelect={() => {
								item.action();
								closeCommand();
							}}
						>
							{item.icon}
							<span>{item.label}</span>
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
