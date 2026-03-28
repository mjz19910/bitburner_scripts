import { NS } from "@ns"
import { Topology, ExpansionCandidate } from "./dnet_types"

const TOPOLOGY_FILE = "/tmp/darknet_topology.json"
const PLAN_FILE = "/tmp/darknet_expansion_plan.json"

type AuthInfo = {
	isOnline?: boolean
	isConnectedToCurrentServer?: boolean
	hasSession?: boolean
	modelId?: string
	passwordHint?: string
	passwordLength?: number
	passwordFormat?: string
	data?: unknown
}

type EdgeReport = {
	source: string
	target: string
	authInfo: AuthInfo
	password?: string | null
	timestamp: number
}

export async function main(ns: NS) {
	if (ns.getHostname() !== "home") {
		ns.tprint(`Run this from home`)
		return
	}

	if (!ns.fileExists(TOPOLOGY_FILE, "home")) {
		ns.tprint(`Missing ${TOPOLOGY_FILE}`)
		return
	}

	const topology = JSON.parse(String(ns.read(TOPOLOGY_FILE))) as Topology
	const plan = buildExpansionPlan(topology)

	ns.write(PLAN_FILE, JSON.stringify(plan, null, 2), "w")

	ns.tprint(`[plan] wrote ${PLAN_FILE}`)
	for (const c of plan) {
		ns.tprint(
			`[plan] target=${c.target} via=${c.bestSource} route=${c.sourceChain.join(" -> ")} score=${c.score} ${c.reason}`
		)
	}
}

function buildExpansionPlan(topology: Topology): ExpansionCandidate[] {
	const out: ExpansionCandidate[] = []

	for (const target of topology.knownHosts) {
		if (target === "home") continue

		// already probed from itself? then not frontier
		const selfReported = !!topology.edgeReports[target]
		if (selfReported) continue

		const incomingSources = topology.reverseEdges[target] ?? []
		if (incomingSources.length === 0) continue

		const candidates: ExpansionCandidate[] = []

		for (const source of incomingSources) {
			const report = topology.edgeReports[source]?.[target]
			if (!report) continue

			const auth = report.authInfo ?? {}
			const isOnline = auth.isOnline !== false
			if (!isOnline) continue

			const deployableFromSource = canOperateFrom(report)
			const sourceChain = topology.chainsFromHome[source] ?? []
			const needsRouteToSource = source !== "home" && sourceChain.length < 2

			let score = 0
			if (deployableFromSource) score += 100
			if (auth.hasSession) score += 50
			if (auth.isConnectedToCurrentServer) score += 25
			score -= sourceChain.length

			candidates.push({
				target,
				bestSource: source,
				sourceChain,
				deployableFromSource,
				needsRouteToSource,
				score,
				reason: explain(auth),
			})
		}

		candidates.sort((a, b) => b.score - a.score)
		if (candidates.length > 0) out.push(candidates[0])
	}

	out.sort((a, b) => b.score - a.score)
	return out
}

function canOperateFrom(report: EdgeReport | undefined): boolean {
	if (!report) return false
	const auth = report.authInfo ?? {}
	return !!auth.isConnectedToCurrentServer || !!auth.hasSession
}

function explain(auth: AuthInfo): string {
	const flags = []
	if (auth.isConnectedToCurrentServer) flags.push("connected")
	if (auth.hasSession) flags.push("session")
	if (auth.isOnline === false) flags.push("offline")
	return flags.join(", ")
}
