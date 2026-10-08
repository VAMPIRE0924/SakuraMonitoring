#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function fail(message) {
	console.error(message);
	process.exit(1);
}

function resolveInside(candidate, parent, label) {
	const resolved = path.resolve(candidate);
	const root = `${path.resolve(parent)}${path.sep}`;
	if (!resolved.startsWith(root)) {
		fail(`${label} escapes its allowed root: ${resolved}`);
	}
	return resolved;
}

function parseRegistry(registryPath) {
	const source = fs.readFileSync(registryPath, "utf8");
	const starts = [...source.matchAll(/^- +path:\s*"([^"]+)"/gm)];
	if (starts.length === 0) fail(`No frontend templates found in: ${registryPath}`);
	const blocks = starts.map((start, index) => ({
		templatePath: start[1],
		text: source.slice(start.index, starts[index + 1]?.index ?? source.length).trimEnd(),
	}));
	return {
		source,
		blocks: blocks.map((block) => ({
			path: block.templatePath,
			name: block.text.match(/\bname:\s*"([^"]+)"/)?.[1],
			text: block.text,
			repository: block.text.match(/\brepository:\s*"([^"]+)"/)?.[1],
			version: block.text.match(/\bversion:\s*"([^"]+)"/)?.[1],
		})),
	};
}

function enforceThemeBoundary(backendRoot, prune, requireSakura) {
	const allowed = new Set(["admin-dist", "user-dist", "sakura-user-dist"]);
	const expectedNames = new Map([
		["admin-dist", "OfficialAdmin"],
		["user-dist", "Official"],
		["sakura-user-dist", "Sakura"],
	]);
	const required = ["admin-dist", "user-dist", ...(requireSakura ? ["sakura-user-dist"] : [])];
	const registryPath = path.join(backendRoot, "service", "singleton", "frontend-templates.yaml");
	const dashboardRoot = path.join(backendRoot, "cmd", "dashboard");
	if (!fs.existsSync(registryPath)) fail(`Frontend template registry not found: ${registryPath}`);
	if (!fs.existsSync(dashboardRoot)) fail(`Dashboard source not found: ${dashboardRoot}`);

	const registry = parseRegistry(registryPath);
	const seen = new Set();
	for (const block of registry.blocks) {
		if (seen.has(block.path)) fail(`Duplicate frontend template path: ${block.path}`);
		if (allowed.has(block.path) && block.name !== expectedNames.get(block.path)) {
			fail(`Unexpected frontend template name for ${block.path}: ${block.name}`);
		}
		seen.add(block.path);
	}
	for (const requiredPath of required) {
		if (!seen.has(requiredPath)) fail(`Required frontend template is missing: ${requiredPath}`);
	}

	const unexpectedBlocks = registry.blocks.filter((block) => !allowed.has(block.path));
	const unexpectedDirs = fs
		.readdirSync(dashboardRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.endsWith("-dist") && !allowed.has(entry.name));

	if (!prune && (unexpectedBlocks.length || unexpectedDirs.length)) {
		fail(
			`Unsupported frontend templates found: ${[
				...unexpectedBlocks.map((block) => block.path),
				...unexpectedDirs.map((entry) => entry.name),
			].join(", ")}`,
		);
	}

	if (prune && unexpectedBlocks.length) {
		const kept = registry.blocks.filter((block) => allowed.has(block.path));
		fs.writeFileSync(registryPath, `${kept.map((block) => block.text).join("\n")}\n`);
	}
	if (prune) {
		for (const entry of unexpectedDirs) {
			const target = resolveInside(path.join(dashboardRoot, entry.name), dashboardRoot, "Template directory");
			fs.rmSync(target, { recursive: true, force: true });
		}
	}

	const finalPaths = parseRegistry(registryPath).blocks.map((block) => block.path);
	if (finalPaths.some((templatePath) => !allowed.has(templatePath))) {
		fail("Frontend theme boundary enforcement failed.");
	}
	console.log(`Frontend theme boundary passed: ${finalPaths.join(", ")}`);
}

function templateUrl(backendRoot, templatePath) {
	const registryPath = path.join(backendRoot, "service", "singleton", "frontend-templates.yaml");
	const template = parseRegistry(registryPath).blocks.find((block) => block.path === templatePath);
	if (!template?.repository || !template?.version) {
		fail(`Template '${templatePath}' is missing repository or version.`);
	}
	const repository = new URL(template.repository);
	const parts = repository.pathname.replace(/^\/|\/$/g, "").split("/");
	if (repository.hostname !== "github.com" || parts.length !== 2) {
		fail(`Unsupported GitHub repository URL: ${template.repository}`);
	}
	console.log(`https://github.com/${parts.join("/")}/releases/download/${template.version}/dist.zip`);
}

function requirePath(candidate, label) {
	if (!fs.existsSync(candidate)) fail(`${label} not found: ${candidate}`);
}

function checkTemplate(workspaceRoot) {
	const backendRoot = path.join(workspaceRoot, "upstream", "nezha");
	enforceThemeBoundary(backendRoot, false, true);
	const registryPath = path.join(backendRoot, "service", "singleton", "frontend-templates.yaml");
	const dashboardMain = path.join(backendRoot, "cmd", "dashboard", "main.go");
	const templateDist = path.join(backendRoot, "cmd", "dashboard", "sakura-user-dist");
	const indexPath = path.join(templateDist, "index.html");
	const adminDist = path.join(backendRoot, "cmd", "dashboard", "admin-dist");
	const userDist = path.join(backendRoot, "cmd", "dashboard", "user-dist");

	for (const [candidate, label] of [
		[registryPath, "Frontend template registry"],
		[dashboardMain, "Dashboard main.go"],
		[indexPath, "Sakura template index"],
		[path.join(adminDist, "index.html"), "Official admin template index"],
		[path.join(userDist, "index.html"), "Official user template index"],
	]) {
		requirePath(candidate, label);
	}

	const registry = fs.readFileSync(registryPath, "utf8");
	if (!/path:\s*"sakura-user-dist"/.test(registry) || !/name:\s*"Sakura"/.test(registry)) {
		fail("Sakura user template is not registered.");
	}
	if (/SakuraAdmin/.test(registry)) fail("SakuraAdmin must not be registered.");
	if (!/\/\/go:embed\s+\*-dist/.test(fs.readFileSync(dashboardMain, "utf8"))) {
		fail("Dashboard embed rule does not include *-dist templates.");
	}

	for (const officialDist of [adminDist, userDist]) {
		const officialIndex = fs.readFileSync(path.join(officialDist, "index.html"), "utf8");
		if (/Sakura Monitoring|sakura-assets/.test(officialIndex)) {
			fail(`Official template appears to contain Sakura assets: ${officialDist}`);
		}
		for (const forbidden of ["sakura-assets", "h7q2m"]) {
			if (fs.existsSync(path.join(officialDist, forbidden))) {
				fail(`Official template contains forbidden directory '${forbidden}': ${officialDist}`);
			}
		}
	}

	for (const asset of [
		"manifest.json",
		"apple-touch-icon.png",
		"sakura-assets/sakura-mark.png",
		"sakura-assets/sakura-background.jpg",
		"sakura-assets/sakura-illustration.webp",
	]) {
		requirePath(path.join(templateDist, asset), "Required Sakura asset");
	}
	if (fs.existsSync(path.join(templateDist, "android-chrome-192x192.png"))) {
		fail("Unreferenced android-chrome-192x192.png should not be present.");
	}

	const index = fs.readFileSync(indexPath, "utf8");
	const missing = [];
	for (const match of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
		const url = match[1];
		if (/^(?:https?:|data:)/i.test(url)) continue;
		const relative = url.split(/[?#]/, 1)[0].replace(/^\/+/, "");
		if (!relative || relative === "src/main.tsx") continue;
		if (!fs.existsSync(path.join(templateDist, relative))) missing.push(url);
	}
	if (missing.length) fail(`Built index references missing local assets: ${missing.join(", ")}`);
	console.log(`Sakura template registry and embedded dist checks passed: ${templateDist}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "enforce-theme-boundary") {
	const backendRoot = args[0];
	if (!backendRoot) fail("Usage: enforce-theme-boundary BACKEND_ROOT [--prune] [--require-sakura]");
	enforceThemeBoundary(path.resolve(backendRoot), args.includes("--prune"), args.includes("--require-sakura"));
} else if (command === "template-url") {
	if (!args[0] || !args[1]) fail("Usage: template-url BACKEND_ROOT TEMPLATE_PATH");
	templateUrl(path.resolve(args[0]), args[1]);
} else if (command === "check-template") {
	if (!args[0]) fail("Usage: check-template WORKSPACE_ROOT");
	checkTemplate(path.resolve(args[0]));
} else {
	fail("Commands: enforce-theme-boundary, template-url, check-template");
}
