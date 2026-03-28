import { NS } from "@ns"
import { SeedReport } from "./dnet_types"
import { ORCHESTRATOR_PORT, WORKER_SCRIPT } from "./dnet_config"

export async function main(ns: NS) {
	const seeds = ns.args.length > 0
		? ns.args.map(String)
		: ["darkweb"]

	if (ns.getHostname() !== "home") {
		ns.tprint(`Run this from home`)
		return
	}

	if (!ns.fileExists("DarkscapeNavigator.exe", "home")) {
		ns.tprint(`Requires "DarkscapeNavigator.exe" on home`)
		return
	}

	for (const seed of seeds) {
		await startSeed(ns, seed)
	}

	ns.tprint(`darknet_start_crawl complete`)
}

async function startSeed(ns: NS, seed: string) {
	ns.tprint(`[start] seeding [${seed}]`)

	// Best effort: inspect auth details from home
	let authInfo = ns.dnet.getServerAuthDetails(seed)
	ns.tprint(`[start] [${seed}] auth = ${JSON.stringify(authInfo, void 0, 2)}`)

	// Seed the orchestrator with the initial known edge
	const report: SeedReport = {
		source: "home",
		target: seed,
		authInfo,
		timestamp: Date.now(),
	}
	ns.tryWritePort(ORCHESTRATOR_PORT, JSON.stringify(report))

	// Copy worker
	const copied = ns.scp([WORKER_SCRIPT], seed, "home")
	if (!copied) {
		ns.tprint(`[start] failed to scp ${WORKER_SCRIPT} to ${seed}`)
		return
	}

	// Launch worker
	const pid = ns.exec(WORKER_SCRIPT, seed, 1)
	if (pid === 0) {
		ns.tprint(`[start] failed to exec ${WORKER_SCRIPT} on ${seed}`)
		return
	}

	ns.tprint(`[start] launched ${WORKER_SCRIPT} on ${seed} pid=${pid}`)
}
