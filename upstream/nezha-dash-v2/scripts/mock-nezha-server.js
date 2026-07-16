import http from "node:http";
import { URL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.MOCK_NEZHA_PORT || 8008);
const serverCount = Number(process.env.MOCK_NEZHA_COUNT || 36);
const updateIntervalMs = Number(
	process.env.MOCK_NEZHA_INTERVAL_MS || (serverCount > 10_000 ? 0 : 2000),
);

const countries = [
	"US",
	"SG",
	"JP",
	"DE",
	"GB",
	"FR",
	"NL",
	"CA",
	"AU",
	"BR",
	"IN",
	"KR",
	"HK",
	"TW",
	"FI",
	"PL",
];

const cities = [
	"Los Angeles",
	"Singapore",
	"Tokyo",
	"Frankfurt",
	"London",
	"Paris",
	"Amsterdam",
	"Toronto",
	"Sydney",
	"Sao Paulo",
	"Mumbai",
	"Seoul",
	"Hong Kong",
	"Taipei",
	"Helsinki",
	"Warsaw",
];

const platforms = ["linux", "debian", "ubuntu", "centos", "alpine", "Windows"];

const previewNames = [
	"RT",
	"DNS",
	"HK",
	"CN2",
	"JP",
	"WIN",
	"T60",
	"HKT",
	"AVL",
	"SG",
	"DE",
	"US",
	"FR",
	"NL",
	"TW",
	"KR",
	"LA",
	"NY",
	"SEA",
	"UK",
	"FI",
	"PL",
	"CA",
	"OFF",
];

const amountVariants = ["6", "0", "-1", undefined];
const expiryVariants = ["days", "permanent", "missing"];

// Cover every billing/expiry/cycle-presence combination with compact host names.
const previewProfiles = [true, false]
	.flatMap((cycle) =>
		expiryVariants.flatMap((expiry) =>
			amountVariants.map((amount) => ({ amount, cycle, expiry })),
		),
	)
	.map((profile, index) => ({
		...profile,
		name: previewNames[index],
		...(index === 4 ? { tags: false } : {}),
		...(index === previewNames.length - 1 ? { offline: true } : {}),
	}));

function previewProfile(index) {
	return (
		previewProfiles[index] || {
			name: `S-${index + 1}`,
			amount: String(3 + ((index + 1) % 8)),
			expiry: (index + 1) % 6 === 0 ? "permanent" : "days",
			cycle: (index + 1) % 11 !== 0,
		}
	);
}

const nowIso = () => new Date().toISOString();

function createServer(index) {
	const id = index + 1;
	const profile = previewProfile(index);
	const platform = platforms[index % platforms.length];
	const memTotal = 2 ** 30 * (2 + (index % 15));
	const diskTotal = 2 ** 30 * (40 + (index % 200));
	const swapTotal = 2 ** 30 * (index % 8);
	const memUsed = memTotal * ((index % 90) / 100);
	const diskUsed = diskTotal * ((index % 84) / 100);
	const swapUsed = swapTotal ? swapTotal * ((index % 60) / 100) : 0;
	const isOffline = profile.offline || id % 17 === 0;
	const publicNote = {};
	if (profile.tags !== false) {
		publicNote.planDataMod = {
			bandwidth: `${200 + (id % 5) * 200}Mbps`,
			extra: cities[index % cities.length],
			trafficVol: id % 5 === 0 ? "Unlimited" : `${1 + (id % 4)}TB`,
			IPv4: "1",
			IPv6: id % 3 === 0 ? "0" : "1",
			networkRoute: ["CN2", "CMI", "AS9929"][id % 3],
		};
	}
	if (profile.amount !== undefined || profile.expiry !== "missing") {
		publicNote.billingDataMod = {
			...(profile.amount !== undefined ? { amount: profile.amount } : {}),
			cycle: id % 4 === 0 ? "yr" : "mo",
			...(profile.expiry === "days"
				? { startDate: "2026-01-01", endDate: "2027-01-01" }
				: profile.expiry === "permanent"
					? { endDate: "0000-00-00" }
					: {}),
		};
	}

	return {
		id,
		name: profile.name,
		public_note: JSON.stringify(publicNote),
		last_active: isOffline
			? new Date(Date.now() - 10 * 60 * 1000).toISOString()
			: nowIso(),
		country_code: countries[index % countries.length],
		host: {
			platform,
			platform_version: platform === "Windows" ? "Server 2022" : "6.8",
			cpu: [`Mock CPU ${1 + (index % 8)} Core`],
			gpu: index % 40 === 0 ? ["Mock GPU"] : [],
			mem_total: memTotal,
			disk_total: diskTotal,
			swap_total: swapTotal,
			arch: index % 5 === 0 ? "arm64" : "amd64",
			boot_time: Math.floor(Date.now() / 1000) - 86_400 * (1 + (index % 365)),
			version: "mock-1.0.0",
		},
		state: {
			cpu: (index * 7) % 100,
			mem_used: memUsed,
			swap_used: swapUsed,
			disk_used: diskUsed,
			net_in_transfer: 2 ** 30 * (index % 500),
			net_out_transfer: 2 ** 30 * ((index * 2) % 500),
			net_in_speed: 1024 * (20 + ((index * 13) % 80_000)),
			net_out_speed: 1024 * (20 + ((index * 17) % 80_000)),
			uptime: 3600 * (1 + (index % 20_000)),
			load_1: Number(((index % 100) / 20).toFixed(2)),
			load_5: Number(((index % 80) / 20).toFixed(2)),
			load_15: Number(((index % 60) / 20).toFixed(2)),
			tcp_conn_count: index % 300,
			udp_conn_count: index % 80,
			process_count: 40 + (index % 240),
			temperatures: [],
			gpu: index % 40 === 0 ? [(index * 3) % 100] : [],
		},
	};
}

const servers = Array.from({ length: serverCount }, (_, index) =>
	createServer(index),
);
const isServerOffline = (server) =>
	previewProfile(server.id - 1).offline || server.id % 17 === 0;

let onlineCount = servers.filter((server) => !isServerOffline(server)).length;

function updateServerMetrics() {
	const now = Date.now();
	let nextOnlineCount = 0;

	for (const server of servers) {
		const isOffline = isServerOffline(server);
		if (!isOffline) {
			server.last_active = new Date(now).toISOString();
			nextOnlineCount += 1;
		}

		const tick = now / 1000;
		const wave = (tick + server.id) % 100;
		server.state.cpu = Number(wave.toFixed(2));
		server.state.net_in_speed = Math.round(
			1024 *
				(8 +
					Math.abs(Math.sin(tick / 4.6 + server.id * 0.73)) * 120 +
					(server.id % 7) * 4),
		);
		server.state.net_out_speed = Math.round(
			1024 *
				(6 +
					Math.abs(Math.cos(tick / 5.2 + server.id * 0.61)) * 105 +
					(server.id % 5) * 3),
		);
		server.state.net_in_transfer += server.state.net_in_speed;
		server.state.net_out_transfer += server.state.net_out_speed;
	}

	onlineCount = nextOnlineCount;
}

function websocketPayload() {
	const payload = { now: Date.now() };
	if (onlineCount > 0) payload.online = onlineCount;
	if (servers.length > 0) payload.servers = servers;
	return JSON.stringify(payload);
}

function jsonResponse(response, data) {
	response.writeHead(200, {
		"Access-Control-Allow-Origin": "*",
		"Cache-Control": "no-store",
		"Content-Type": "application/json; charset=utf-8",
	});
	response.end(JSON.stringify(data));
}

const populatedServerGroups = [
	{
		group: {
			id: 1,
			created_at: nowIso(),
			updated_at: nowIso(),
			name: "HOST",
		},
		servers:
			serverCount > 10_000
				? []
				: servers.slice(0, 4).map((server) => server.id),
	},
	{
		group: {
			id: 2,
			created_at: nowIso(),
			updated_at: nowIso(),
			name: "CN",
		},
		servers:
			serverCount > 10_000
				? []
				: servers
						.filter((server) => server.country_code === "TW")
						.map((server) => server.id),
	},
	...[
		["东亚", ["JP", "KR", "HK", "TW"]],
		["东南亚", ["SG"]],
		["西亚", ["IN"]],
		["北美洲", ["US", "CA"]],
		["欧洲", ["DE", "GB", "FR", "NL", "FI", "PL"]],
	].map(([name, countryCodes], index) => ({
		group: {
			id: index + 3,
			created_at: nowIso(),
			updated_at: nowIso(),
			name,
		},
		servers:
			serverCount > 10_000
				? []
				: servers
						.filter((server) => countryCodes.includes(server.country_code))
						.map((server) => server.id),
	})),
];
const serverGroups = serverCount === 0 ? [] : populatedServerGroups;

function cycleTransferStats() {
	const entries = servers
		.filter((server) => previewProfile(server.id - 1).cycle)
		.map((server) => [String(server.id), server]);
	return {
		monthly: {
			name: "Monthly",
			from: Object.fromEntries(
				entries.map(([id]) => [id, "2026-07-01T00:00:00.000Z"]),
			),
			to: Object.fromEntries(
				entries.map(([id]) => [id, "2026-08-01T00:00:00.000Z"]),
			),
			max: Object.fromEntries(
				entries.map(([id, server]) => [
					id,
					server.id % 5 === 0 ? -1 : (1 + (server.id % 4)) * 1024 ** 4,
				]),
			),
			min: {},
			server_name: Object.fromEntries(
				entries.map(([id, server]) => [id, server.name]),
			),
			transfer: Object.fromEntries(
				entries.map(([id, server]) => [
					id,
					server.state.net_in_transfer + server.state.net_out_transfer,
				]),
			),
			next_update: Object.fromEntries(
				entries.map(([id]) => [id, "2026-08-01T00:00:00.000Z"]),
			),
		},
	};
}

const serviceNames = [
	"Cloudflare",
	"Google",
	"AS4809",
	"AS9929",
	"AS58807",
	"AS37963",
	"AS45090",
	"AS4134",
	"AS4837",
	"AS9808",
	"面板反代",
	"极光面板",
	"邮箱",
];

function createServiceHistory(seed) {
	return Array.from({ length: 30 }, (_, index) => {
		const degraded = seed >= 10 && index % (7 + (seed % 3)) === 0;
		const down = degraded ? 2 + (seed % 3) : index % (19 + seed) === 0 ? 1 : 0;
		return {
			up: 24 - down,
			down,
			delay: Math.round(
				5 + seed * 9 + Math.abs(Math.sin(index / 4 + seed)) * (18 + seed * 3),
			),
		};
	});
}

function serviceResponse() {
	if (serverCount === 0) return {};
	return Object.fromEntries(
		serviceNames.map((serviceName, index) => {
			const history = createServiceHistory(index);
			return [
				`mock_${index + 1}`,
				{
					service_name: serviceName,
					current_up: history.at(-1).up,
					current_down: history.at(-1).down,
					total_up: history.reduce((total, item) => total + item.up, 0),
					total_down: history.reduce((total, item) => total + item.down, 0),
					delay: history.map((item) => item.delay),
					up: history.map((item) => item.up),
					down: history.map((item) => item.down),
				},
			];
		}),
	);
}

function monitorResponse(serverId, period = "1d") {
	const pointCount = period === "30d" ? 120 : period === "7d" ? 84 : 48;
	const step =
		period === "30d"
			? 6 * 3600_000
			: period === "7d"
				? 2 * 3600_000
				: 30 * 60_000;
	const now = Date.now();
	const createdAt = Array.from(
		{ length: pointCount },
		(_, index) => now - (pointCount - index - 1) * step,
	);
	const names = ["AS37963", "AS45090", "AS4134", "AS4837", "AS9808"];

	return {
		success: true,
		data: names.map((name, monitorIndex) => ({
			monitor_id: monitorIndex + 1,
			monitor_name: name,
			display_index: monitorIndex + 1,
			server_id: serverId,
			server_name: servers[serverId - 1]?.name || `S-${serverId}`,
			created_at: createdAt,
			avg_delay: createdAt.map((_, index) =>
				Number(
					(
						0.18 +
						monitorIndex * 0.72 +
						(Math.sin(index / 5 + monitorIndex) + 1) * 0.09
					).toFixed(2),
				),
			),
			packet_loss: createdAt.map((_, index) =>
				index % (29 + monitorIndex * 3) === 0 ? 1 : 0,
			),
		})),
	};
}

const httpServer = http.createServer((request, response) => {
	const requestUrl = new URL(
		request.url || "/",
		`http://${request.headers.host}`,
	);

	if (request.method === "OPTIONS") {
		response.writeHead(204, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		});
		response.end();
		return;
	}

	const monitorMatch = requestUrl.pathname.match(
		/^\/api\/v1\/server\/(\d+)\/service$/,
	);
	if (monitorMatch) {
		jsonResponse(
			response,
			monitorResponse(
				Number(monitorMatch[1]),
				requestUrl.searchParams.get("period") || "1d",
			),
		);
		return;
	}

	switch (requestUrl.pathname) {
		case "/api/v1/setting":
			jsonResponse(response, {
				success: true,
				data: {
					config: {
						language: "en-US",
						site_name: `Nezha Mock ${serverCount}`,
					},
					tsdb_enabled: true,
				},
			});
			return;
		case "/api/v1/server-group":
			jsonResponse(response, { success: true, data: serverGroups });
			return;
		case "/api/v1/service":
			jsonResponse(response, {
				success: true,
				data: {
					services: serviceResponse(),
					cycle_transfer_stats: cycleTransferStats(),
				},
			});
			return;
		case "/api/v1/profile":
			jsonResponse(response, {
				success: true,
				data: {
					id: 1,
					username: "mock-user",
					password: "",
					created_at: nowIso(),
					updated_at: nowIso(),
				},
			});
			return;
		default:
			jsonResponse(response, { success: true, data: [] });
	}
});

const websocketServer = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (request, socket, head) => {
	if (!request.url?.startsWith("/api/v1/ws/server")) {
		socket.destroy();
		return;
	}

	websocketServer.handleUpgrade(request, socket, head, (websocket) => {
		websocketServer.emit("connection", websocket, request);
	});
});

websocketServer.on("connection", (websocket) => {
	websocket.send(websocketPayload());
});

if (updateIntervalMs > 0) {
	setInterval(() => {
		updateServerMetrics();
		const payload = websocketPayload();
		for (const client of websocketServer.clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(payload);
			}
		}
	}, updateIntervalMs);
}

httpServer.listen(port, () => {
	console.log(
		`Mock Nezha API listening on http://localhost:${port} with ${serverCount} servers`,
	);
	if (updateIntervalMs === 0) {
		console.log(
			"Mock Nezha websocket is in static mode. Set MOCK_NEZHA_INTERVAL_MS to enable repeated full-payload updates.",
		);
	}
});
