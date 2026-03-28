import { NS } from "@ns";
import { Topology } from "./dnet_types";

const WORKER_SCRIPT = "darknet_probe_worker.ts";
const TOPOLOGY_FILE = "/tmp/darknet_topology.json";
const MAP_FILE = "/tmp/darknet_map.json";

export async function main(ns: NS) {
	if (ns.getHostname() !== "home") {
		ns.tprint(`Run this from home`);
		return;
	}

	const knownNodes = loadKnownNodes(ns);
	if (knownNodes.length === 0) {
		ns.tprint(`[rescan] no known darknet nodes found`);
		return;
	}

	ns.tprint(`[rescan] rescanning ${knownNodes.length} node(s)`);

	let started = 0;
	let skipped = 0;
	let failed = 0;

	for (const node of knownNodes) {
		const ok = await rescanNode(ns, node);
		if (ok === true) started++;
		else if (ok === false) failed++;
		else skipped++;
	}

	ns.tprint(
		`[rescan] started=${started} skipped=${skipped} failed=${failed}`,
	);
}

function loadKnownNodes(ns: NS): string[] {
	const found = new Set<string>();

	// Prefer topology file
	if (ns.fileExists(TOPOLOGY_FILE, "home")) {
		try {
			const topology = JSON.parse(
				String(ns.read(TOPOLOGY_FILE)),
			) as Topology;
			for (const node of Object.keys(topology.edges ?? {})) {
				found.add(node);
			}
		} catch (err) {
			ns.tprint(
				`[rescan] failed to parse ${TOPOLOGY_FILE}: ${String(err)}`,
			);
		}
	}

	// Fallback to raw map
	if (found.size === 0 && ns.fileExists(MAP_FILE, "home")) {
		try {
			const raw = JSON.parse(String(ns.read(MAP_FILE))) as Record<
				string,
				Report
			>;
			for (const node of Object.keys(raw)) {
				found.add(node);
			}
		} catch (err) {
			ns.tprint(`[rescan] failed to parse ${MAP_FILE}: ${String(err)}`);
		}
	}

	return [...found].sort();
}

async function rescanNode(ns: NS, node: string): Promise<boolean | null> {
	let authInfo = ns.dnet.getServerAuthDetails(node);

	const { isOnline, hasSession } = authInfo;

	if (!isOnline) {
		ns.print(`[rescan] skip ${node}: offline`);
		return null;
	}

	if (!hasSession) {
		ns.print(`[rescan] skip ${node}: no session`);
		return null;
	}

	// refresh worker copy
	const copied = ns.scp([WORKER_SCRIPT], node, "home");
	if (!copied) {
		ns.print(`[rescan] failed to scp worker to ${node}`);
		return false;
	}

	// optional: kill old worker before restarting
	for (const proc of ns.ps(node)) {
		if (proc.filename === WORKER_SCRIPT) {
			ns.kill(proc.pid);
		}
	}

	const pid = ns.exec(WORKER_SCRIPT, node, 1);
	if (pid === 0) {
		ns.print(`[rescan] failed to exec worker on ${node}`);
		return false;
	}

	ns.print(`[rescan] launched worker on ${node} pid=${pid}`);
	return true;
}
