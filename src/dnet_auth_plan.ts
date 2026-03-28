/**
 * darknet_auth_plan.ts
 *
 * Produces an authentication plan for all known nodes.
 * Checks which nodes are reachable, which require direct connection,
 * and which require multi-hop authentication.
 */
import { Topology, AuthCandidate } from "./types"
import { TOPOLOGY_FILE, AUTH_PLAN_FILE, HOME_HOST } from "./dnet_config"

export async function main(ns: NS) {
	if (ns.getHostname() !== HOME_HOST) {
		ns.tprint("Run this from home only")
		return
	}

	if (!ns.fileExists(TOPOLOGY_FILE, HOME_HOST)) {
		ns.tprint(`Missing topology file: ${TOPOLOGY_FILE}`)
		return
	}

	const topology = JSON.parse(ns.read(TOPOLOGY_FILE)) as Topology
	const authPlan: AuthCandidate[] = buildAuthPlan(ns, topology)

	ns.write(AUTH_PLAN_FILE, JSON.stringify(authPlan, null, 2), "w")
	ns.tprint(`[auth] wrote ${AUTH_PLAN_FILE} for ${authPlan.length} targets`)

	for (const c of authPlan) {
		ns.tprint(`[auth] target=${c.target} path=${c.authPath.join(" -> ")} reason=${c.reason}`)
	}
}

function buildAuthPlan(_ns: NS, topology: Topology): AuthCandidate[] {
	const plan: AuthCandidate[] = []

	for (const target of topology.knownHosts) {
		if (target === HOME_HOST) continue

		const incomingSources = topology.reverseEdges[target] ?? []
		if (incomingSources.length === 0) continue

		// pick best source for authentication
		let bestSource: string | null = null
		let bestScore = -Infinity

		for (const source of incomingSources) {
			const report = topology.edgeReports[source]?.[target]
			if (!report) continue

			const auth = report.authInfo ?? {}
			let score = 0
			if (auth.hasSession) score += 100
			if (auth.isConnectedToCurrentServer) score += 50
			if (auth.isOnline !== false) score += 10
			if (score > bestScore) {
				bestScore = score
				bestSource = source
			}
		}

		if (!bestSource) continue

		// The auth path is the route from home to bestSource, then target if direct auth needed
		const sourceChain = topology.chainsFromHome[bestSource] ?? []

		const report = topology.edgeReports[bestSource][target]
		const requiresDirectAuth = !report?.authInfo?.hasSession

		plan.push({
			target,
			authPath: [...sourceChain, bestSource],
			requiresDirectAuth,
			reason: `connected=${report?.authInfo?.isConnectedToCurrentServer} session=${report?.authInfo?.hasSession}`,
		})
	}

	return plan
}
