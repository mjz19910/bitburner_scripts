import { NS } from "@ns";

/**
 * darknet_crawler.ts
 *
 * Distributed darknet crawler.
 * Probes local neighbors, inspects auth, authenticates, connects, deploys itself,
 * and reports back to home orchestrator via a port.
 */
const ORCHESTRATOR_PORT = 5;
const SELF_SCRIPT = "darknet_crawler.ts";
export const deps = [SELF_SCRIPT];

export const static_known_passwords = [
	"admin",
	"password",
	"0000",
	"12345",
	"",
];

const seenFile = "/tmp/darknet_seen.txt";

const model_ids_ro = [
	"FreshInstall_1.0",
] as const;
const model_ids = new Set(model_ids_ro);

export async function main(ns: NS) {
	const host = ns.getHostname();

	if (host === "home") {
		ns.tprint(
			"[home] Crawler should be launched on a darknet node, not home.",
		);
		return;
	}

	if (!ns.fileExists("DarkscapeNavigator.exe", "home")) {
		ns.tprint(`[${host}] Missing DarkscapeNavigator.exe`);
		return;
	}

	if (alreadySeen(ns, host)) {
		ns.print(`[${host}] Already crawled.`);
		return;
	}
	markSeen(ns, host);

	// Probe local neighbors
	let neighbors: string[] = [];
	try {
		neighbors = ns.dnet.probe();
		ns.print(`[${host}] Probe returned ${neighbors.join(", ")}`);
	} catch (err) {
		ns.print(`[${host}] probe() failed: ${String(err)}`);
		return;
	}

	for (const target of neighbors) {
		if (target === host || alreadySeen(ns, target)) continue;

		// Get auth hints
		let authInfo = ns.dnet.getServerAuthDetails(target);
		ns.tprint(
			`[${host}] ${target} auth info: ${
				JSON.stringify(authInfo, void 0, 2)
			}`,
		);
		const { modelId } = authInfo;
		if (!model_ids.has(modelId as (typeof model_ids_ro)[number])) {
			ns.tprint(`[${host}] ${target} new modelId=`, modelId);
			break;
		}

		if (authInfo.modelId === "") {
		}

		// Build candidate passwords from hints + static list
		const candidates = [
			...static_known_passwords,
		];

		// Try authenticate
		let password: string | null = null;
		for (const pw of candidates) {
			try {
				const result = await ns.dnet.authenticate(target, pw);
				if (result && (result.success ?? false)) {
					password = pw;
					ns.print(`[${host}] Authenticated ${target} with "${pw}"`);
					break;
				}
			} catch {
				try {
					const hb = await ns.dnet.heartbleed(target);
					ns.print(
						`[${host}] heartbleed(${target}) logs:\n${
							hb.logs.join("\n")
						}`,
					);
				} catch {}
			}
		}
		if (!password) {
			ns.print(`[${host}] Failed to authenticate ${target}`);
			continue;
		}

		// Connect
		let connected = false;
		try {
			const connResult = ns.dnet.connectToSession(target, password);
			connected = !!(connResult && (connResult.success ?? false));
			ns.print(
				`[${host}] connectToSession(${target}) => ${
					JSON.stringify(connResult)
				}`,
			);
		} catch {
			connected = false;
		}
		if (!connected) continue;

		// SCP + Exec self
		try {
			ns.scp(deps, target, host);
			const pid = ns.exec(SELF_SCRIPT, target, 1);
			if (pid === 0) ns.print(`[${host}] Failed to exec on ${target}`);
		} catch (err) {
			ns.print(`[${host}] SCP/exec failed for ${target}: ${String(err)}`);
		}

		// Report to orchestrator
		const report = {
			source: host,
			target,
			authInfo,
			password: password ?? null,
			timestamp: Date.now(),
		};
		ns.tryWritePort(ORCHESTRATOR_PORT, JSON.stringify(report));

		markSeen(ns, target);
	}
}

function alreadySeen(ns: NS, target: string): boolean {
	if (!ns.fileExists(seenFile, "home")) return false;
	const content = ns.read(seenFile);
	return content.split("\n").map((s) => s.trim()).includes(target);
}

function markSeen(ns: NS, target: string) {
	ns.write(seenFile, `${target}\n`, "a");
}
