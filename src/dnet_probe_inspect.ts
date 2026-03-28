import { NS } from "@ns";

/**
 * darknet_probe_inspect.ts
 *
 * Probes the current node, retrieves auth details for each neighbor,
 * and sends results to home via a port.
 */
export async function main(ns: NS) {
	const ORCHESTRATOR_PORT = 5;
	const host = ns.getHostname();

	ns.tprint(`[${host}] Running probe+auth inspect`);

	let neighbors: string[] = ns.dnet.probe();
	ns.tprint(`[${host}] probe returned ${neighbors.join(", ")}`);

	for (const target of neighbors) {
		try {
			const authInfo = ns.dnet.getServerAuthDetails(target);
			const report = {
				source: host,
				target,
				authInfo,
				timestamp: Date.now(),
			};
			ns.tryWritePort(ORCHESTRATOR_PORT, JSON.stringify(report));
			ns.print(`[${host}] sent report for ${target}`);
		} catch (err) {
			ns.print(
				`[${host}] failed to get auth for ${target}: ${String(err)}`,
			);
		}
	}
}
