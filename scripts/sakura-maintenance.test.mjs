import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = new URL("./sakura-maintenance.mjs", import.meta.url);
const allowed = [
	["admin-dist", "OfficialAdmin"],
	["user-dist", "Official"],
	["sakura-user-dist", "Sakura"],
];

function fixture(t, templates) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "sakura-theme-boundary-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const registry = path.join(root, "service/singleton/frontend-templates.yaml");
	fs.mkdirSync(path.dirname(registry), { recursive: true });
	for (const [directory] of templates) {
		fs.mkdirSync(path.join(root, "cmd/dashboard", directory), { recursive: true });
	}
	fs.writeFileSync(registry, templates.map(([directory, name]) =>
		`- path: "${directory}"\n  name: "${name}"\n`,
	).join(""));
	return { root, registry };
}

function run(root, ...options) {
	return spawnSync(process.execPath, [
		fileURLToPath(script), "enforce-theme-boundary", root, "--require-sakura", ...options,
	], { encoding: "utf8" });
}

test("accepts only the official and Sakura template pairs", (t) => {
	const { root } = fixture(t, allowed);
	assert.equal(run(root).status, 0);
});

test("refuses future upstream themes until they are pruned", (t) => {
	const { root, registry } = fixture(t, [...allowed, ["future-theme-dist", "FutureTheme"]]);
	assert.equal(run(root).status, 1);
	assert.equal(run(root, "--prune").status, 0);
	assert.equal(fs.existsSync(path.join(root, "cmd/dashboard/future-theme-dist")), false);
	assert.doesNotMatch(fs.readFileSync(registry, "utf8"), /FutureTheme/);
});

test("refuses an unrelated theme hidden under an allowed directory", (t) => {
	const { root } = fixture(t, [...allowed.slice(0, 2), ["sakura-user-dist", "FutureTheme"]]);
	assert.equal(run(root, "--prune").status, 1);
});

test("requires Sakura in the release source", (t) => {
	const { root } = fixture(t, allowed.slice(0, 2));
	assert.equal(run(root).status, 1);
});

test("rejects runtime stores that could restore or install external themes", (t) => {
	const { root } = fixture(t, allowed);
	const configPath = path.join(root, "service/singleton/config.go");
	fs.writeFileSync(configPath, "FrontendStore: frontend.NewStore(root, templates)");
	assert.equal(run(root).status, 1);
	fs.writeFileSync(configPath, "FrontendStore: frontend.NewBuiltinStore(root, templates)");
	assert.equal(run(root).status, 0);
});
