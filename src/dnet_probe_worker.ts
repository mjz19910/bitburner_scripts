/**
 * darknet_probe_worker.ts
 *
 * Worker script that:
 * - probes the current darknet node
 * - inspects auth info for each neighbor
 * - sends results to home orchestrator via port
 *
 * Usage:
 *  ns.exec("darknet_probe_worker.ts", <node>, 1)
 */

import { NS } from "@ns";

const ORCHESTRATOR_PORT = 5;

export async function main(ns: NS) {
	const host = ns.getHostname();
	ns.tprint(`[${host}] Starting darknet_probe_worker`);

	if (!ns.fileExists("DarkscapeNavigator.exe", "home")) {
		ns.tprint(`[${host}] Missing DarkscapeNavigator.exe`);
		return;
	}

	let neighbors = ns.dnet.probe();
	ns.tprint(`[${host}] Probe returned: ${neighbors.join(", ")}`);

	for (const target of neighbors) {
		if (!target || target === host) continue;

		let authInfo = ns.dnet.getServerAuthDetails(target);

		const report = {
			source: host,
			target,
			authInfo,
			timestamp: Date.now(),
		};

		const success = ns.tryWritePort(
			ORCHESTRATOR_PORT,
			JSON.stringify(report),
		);
		if (!success) {
			ns.tprint(
				`[${host}] Failed to send report for ${target}: port full}`,
			);
			continue;
		}
		ns.tprint(`[${host}] Report sent for ${target}`);
	}

	ns.tprint(`[${host}] darknet_probe_worker finished`);
}
