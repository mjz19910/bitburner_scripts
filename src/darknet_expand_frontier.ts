const EXPAND_WORKER = "darknet_expand_worker.ts"
const TOPOLOGY_FILE = "/tmp/darknet_topology.json"

type AuthInfo = {
	isOnline?: boolean
	hasSession?: boolean
}

type Report = {
	source: string
	target: string
	authInfo?: AuthInfo
}

type Topology = {
	nodes: Record<string, Report>
	chains: Record<string, string[]>
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
	const parentToTargets = new Map<string, string[]>()

	for (const target of Object.keys(topology.nodes)) {
		const auth = topology.nodes[target]?.authInfo ?? {}
		const isOnline = auth.isOnline !== false
		const hasSession = auth.hasSession

		if (!isOnline || hasSession) continue

		const chain = topology.chains[target] ?? []
		if (chain.length < 2) continue

		const parent = chain[chain.length - 2]
		const parentAuth = topology.nodes[parent]?.authInfo ?? {}

		// only use parents that are already sessioned/reachable
		if (parent !== "home" && !parentAuth.hasSession) continue

		if (!parentToTargets.has(parent)) {
			parentToTargets.set(parent, [])
		}
		parentToTargets.get(parent)!.push(target)
	}

	if (parentToTargets.size === 0) {
		ns.tprint(`[expand] no expandable targets found`)
		return
	}

	for (const [parent, targets] of parentToTargets.entries()) {
		if (parent === "home") {
			ns.tprint(`[expand] skip parent=home for ${targets.join(", ")} (direct home auth path not handled here)`)
			continue
		}

		const ai = ns.dnet.getServerAuthDetails(parent)
		const parent_depth = ns.dnet.getDepth(parent)

		ns.print("auth info ", ai)

		const copied = ns.scp([EXPAND_WORKER], parent, "home")
		if (!copied) {
			ns.print(`[expand] parent_depth ${parent_depth}`)
			ns.print(`[expand] failed to scp expand worker to ${parent}`)
			continue
		}

		const pid = ns.exec(EXPAND_WORKER, parent, 1, ...targets)
		if (pid === 0) {
			ns.print(`[expand] parent_depth ${parent_depth}`)
			ns.print(`[expand] failed to exec expand worker on ${parent}`)
			continue
		}

		ns.tprint(`[expand] launched expand worker on ${parent} for: ${targets.join(", ")}`)
	}
}
