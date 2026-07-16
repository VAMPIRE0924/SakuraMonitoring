import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const viteCommand = isWindows
	? [process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "pnpm dev"]]
	: ["pnpm", ["dev"]];

const children = [
	spawn(process.execPath, ["scripts/mock-nezha-server.js"], {
		stdio: "inherit",
	}),
	spawn(viteCommand[0], viteCommand[1], {
		stdio: "inherit",
	}),
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
	if (shuttingDown) return;
	shuttingDown = true;

	for (const child of children) {
		if (!child.killed) {
			child.kill("SIGTERM");
		}
	}

	process.exit(exitCode);
}

for (const child of children) {
	child.on("exit", (code, signal) => {
		if (shuttingDown) return;
		if (code === 0 || signal === "SIGTERM") return;

		shutdown(code ?? 1);
	});
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
