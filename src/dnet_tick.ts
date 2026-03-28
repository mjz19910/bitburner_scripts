/**
 * darknet_tick.ts
 *
 * Event-driven darknet tick:
 * - Listens for triggers on a port
 * - Updates topology from edge reports
 * - Builds auth plan and expansion plan
 * - Sends tasks to persistent workers
 */

import {
	AuthCandidate,
	EdgeReport,
	ExpansionCandidate,
	Topology,
	WorkAssignment,
} from "./dnet_types";
import {
	AUTH_PLAN_FILE,
	AUTO_TICK_PORT,
	EDGE_REPORTS_FILE,
	HOME_HOST,
	PLAN_FILE,
	TOPOLOGY_FILE,
	WORKER_PORT,
} from "./dnet_config";
import { NS } from "@ns";

export async function main(ns: NS) {
	ns.disableLog("ALL");
	ns.tprint("[tick] starting darknet tick listener");

	while (true) {
		const msg = ns.readPort(AUTO_TICK_PORT);
		if (msg && msg !== "NULL PORT DATA") {
			ns.print(`[tick] triggered by message: ${msg}`);
			await runTick(ns);
		}

		await ns.sleep(500); // avoid busy loop
	}
}

/**
 * Run one tick of the crawler
 */
async function runTick(ns: NS) {
	const timestamp = Date.now();
	ns.print(`[tick] running tick at ${timestamp}`);

	// 1️⃣ Load edge reports
	let edgeReports: Record<string, Record<string, EdgeReport>> = {};
	if (ns.fileExists(EDGE_REPORTS_FILE, HOME_HOST)) {
		edgeReports = JSON.parse(
			ns.read(EDGE_REPORTS_FILE),
		) as typeof edgeReports;
	}

	// 2️⃣ Build topology
	const topology = buildTopology(edgeReports);
	ns.write(TOPOLOGY_FILE, JSON.stringify(topology, null, 2), "w");

	// 3️⃣ Build auth plan
	const authPlan = buildAuthPlan(ns, topology);
	ns.write(AUTH_PLAN_FILE, JSON.stringify(authPlan, null, 2), "w");

	// 4️⃣ Build expansion plan
	const expansionPlan = buildExpansionPlan(ns, topology);
	ns.write(PLAN_FILE, JSON.stringify(expansionPlan, null, 2), "w");

	// 5️⃣ Dispatch tasks to workers
	for (const candidate of expansionPlan) {
		const task: WorkAssignment = {
			taskId: timestamp + Math.floor(Math.random() * 1000),
			target: candidate.target,
			sourceChain: candidate.sourceChain,
		};
		ns.tryWritePort(WORKER_PORT, JSON.stringify(task));
		ns.print(`[tick] sent task ${task.taskId} target=${task.target}`);
	}

	ns.print(`[tick] completed tick`);
}

/** Build topology from edgeReports */
function buildTopology(
	edgeReports: Record<string, Record<string, EdgeReport>>,
): Topology {
	const topology: Topology = {
		edgeReports,
		edges: {},
		reverseEdges: {},
		chainsFromHome: {},
		knownHosts: [],
	};

	for (const source in edgeReports) {
		topology.edges[source] = Object.keys(edgeReports[source]);
		for (const target of Object.keys(edgeReports[source])) {
			if (!topology.reverseEdges[target]) {
				topology.reverseEdges[target] = [];
			}
			topology.reverseEdges[target].push(source);

			if (!topology.knownHosts.includes(source)) {
				topology.knownHosts.push(source);
			}
			if (!topology.knownHosts.includes(target)) {
				topology.knownHosts.push(target);
			}
		}
	}

	// Simple BFS from home to build chains
	topology.chainsFromHome[HOME_HOST] = [HOME_HOST];
	const visited = new Set<string>([HOME_HOST]);
	const queue: string[] = [HOME_HOST];
	while (queue.length > 0) {
		const current = queue.shift()!;
		const neighbors = topology.edges[current] ?? [];
		for (const n of neighbors) {
			if (!visited.has(n)) {
				topology.chainsFromHome[n] = [
					...(topology.chainsFromHome[current] ?? []),
					n,
				];
				visited.add(n);
				queue.push(n);
			}
		}
	}

	return topology;
}

/** Build auth plan */
function buildAuthPlan(ns: NS, topology: Topology): AuthCandidate[] {
	const plan: AuthCandidate[] = [];

	for (const target of topology.knownHosts) {
		if (target === HOME_HOST) continue;
		const sources = topology.reverseEdges[target] ?? [];
		if (sources.length === 0) continue;

		let bestSource: string | null = null;
		let bestScore = -Infinity;

		for (const source of sources) {
			const report = topology.edgeReports[source]?.[target];
			if (!report) continue;
			const auth = report.authInfo ?? {};
			let score = 0;
			if (auth.hasSession) score += 100;
			if (auth.isConnectedToCurrentServer) score += 50;
			if (auth.isOnline !== false) score += 10;
			if (score > bestScore) {
				bestScore = score;
				bestSource = source;
			}
		}

		if (!bestSource) continue;
		const sourceChain = topology.chainsFromHome[bestSource] ?? [];
		const report = topology.edgeReports[bestSource][target];
		const requiresDirectAuth = !report?.authInfo?.hasSession;

		plan.push({
			target,
			authPath: [...sourceChain, bestSource],
			requiresDirectAuth,
			reason:
				`connected=${report?.authInfo?.isConnectedToCurrentServer} session=${report?.authInfo?.hasSession}`,
		});
	}

	return plan;
}

/** Build expansion plan */
function buildExpansionPlan(ns: NS, topology: Topology): ExpansionCandidate[] {
	const plan: ExpansionCandidate[] = [];

	for (const target of topology.knownHosts) {
		if (target === HOME_HOST) continue;
		const sources = topology.reverseEdges[target] ?? [];
		if (sources.length === 0) continue;

		let bestSource: string | null = null;
		let bestScore = -Infinity;

		for (const source of sources) {
			const report = topology.edgeReports[source]?.[target];
			if (!report) continue;
			let score = 0;
			if (report.authInfo?.hasSession) score += 100;
			else if (report.authInfo?.isConnectedToCurrentServer) score += 50;
			else score += 10;
			if (score > bestScore) {
				bestScore = score;
				bestSource = source;
			}
		}

		if (!bestSource) continue;
		const sourceChain = topology.chainsFromHome[bestSource] ?? [];
		plan.push({
			target,
			bestSource,
			sourceChain,
			deployableFromSource: true,
			needsRouteToSource:
				sourceChain[sourceChain.length - 1] !== bestSource,
			score: bestScore,
			reason: "",
		});
	}

	return plan;
}
