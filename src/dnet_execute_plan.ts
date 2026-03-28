/**
 * darknet_execute_plan.ts
 *
 * Reads a darknet expansion plan and executes it.
 * Handles multi-hop staging of workers to reach a deployable source host.
 * Then launches the probe/expand worker on the source host against the target.
 */

import { ExpansionCandidate } from "./types"
import { PLAN_FILE, WORKER_SCRIPT, HOME_HOST } from "./dnet_config"

export async function main(ns: NS) {
	if (ns.getHostname() !== HOME_HOST) {
		ns.tprint("Run this from home only")
		return
	}

	if (!ns.fileExists(PLAN_FILE, HOME_HOST)) {
		ns.tprint(`Missing plan file: ${PLAN_FILE}`)
		return
	}

	const plan = JSON.parse(ns.read(PLAN_FILE)) as ExpansionCandidate[]

	for (const candidate of plan) {
		ns.tprint(`[execute] target=${candidate.target} via=${candidate.bestSource}`)

		// 1. Stage worker to the source host if needed
		const staged = await stageWorkerAlongRoute(ns, candidate.sourceChain)
		if (!staged) {
			ns.tprint(`[execute] failed to stage worker to ${candidate.bestSource}`)
			continue
		}

		// 2. Execute worker on source host against target
		const success = await runWorkerOnSource(ns, candidate.bestSource, candidate.target)
		if (success) {
			ns.tprint(`[execute] launched worker on ${candidate.bestSource} -> ${candidate.target}`)
		} else {
			ns.tprint(`[execute] failed to launch worker on ${candidate.bestSource} -> ${candidate.target}`)
		}
	}
}

/** Stage the worker script hop by hop along the route from home to source */
async function stageWorkerAlongRoute(ns: NS, route: string[]): Promise<boolean> {
	// Route should include "home" as first element
	for (let i = 1; i < route.length; i++) {
		const from = route[i - 1]
		const to = route[i]

		ns.print(`[stage] ${from} -> ${to}`)

		// Check if the worker already exists on "to"
		if (ns.fileExists(WORKER_SCRIPT, to)) continue

		// Need session or connection to copy it
		const authInfo = ns.dnet.getServerAuthDetails(to)
		if (!canOperateFrom(authInfo)) {
			ns.print(`[stage] cannot scp to ${to} from ${from}, trying authenticate`)
			if (authInfo.isConnectedToCurrentServer) {
				try {
					await ns.dnet.authenticate(to, "")
				} catch { }
			}
		}

		// Attempt scp
		const ok = ns.scp([WORKER_SCRIPT], to, from)
		if (!ok) {
			ns.print(`[stage] scp failed: ${from} -> ${to}`)
			return false
		}
	}

	return true
}

/** Run worker on source host against target */
async function runWorkerOnSource(ns: NS, source: string, target: string): Promise<boolean> {
	for (const proc of ns.ps(source)) {
		if (proc.filename === WORKER_SCRIPT) ns.kill(proc.pid)
	}

	const pid = ns.exec(WORKER_SCRIPT, source, 1, target)
	return pid > 0
}

/** Check if source can scp/exec on the target */
function canOperateFrom(authInfo: any): boolean {
	if (!authInfo) return false
	return !!authInfo.isConnectedToCurrentServer || !!authInfo.hasSession
}
