/** Returns all servers where current money is < 95% of maxMoney */
export function serversToGrow(ns: NS, filterOwned = false): string[] {
	const allServers: string[] = ["home"]
	const discovered = new Set(allServers)

	// BFS scan to get all servers
	for (let i = 0; i < allServers.length; i++) {
		const host = allServers[i]
		for (const child of ns.scan(host)) {
			if (!discovered.has(child)) {
				discovered.add(child)
				allServers.push(child)
			}
		}
	}

	// Filter servers that should be grown
	const growTargets = allServers.filter((srv) => {
		if (filterOwned && ns.getServerMaxMoney(srv) <= 0) return false // skip non-money servers
		const curMoney = ns.getServerMoneyAvailable(srv)
		const maxMoney = ns.getServerMaxMoney(srv)
		if (maxMoney <= 0) return false
		const ratio = curMoney / maxMoney
		return ratio < 0.95 // less than 95% full? needs growth
	})

	return growTargets
}

/** Returns servers that need growth and their grow time */
export function serversToGrowWithTime(ns: NS, minRatio = 0.95): { server: string; growTime: number; curMoney: number; maxMoney: number }[] {
	const allServers: string[] = ["home"]
	const discovered = new Set(allServers)

	// BFS scan to discover all servers
	for (let i = 0; i < allServers.length; i++) {
		const host = allServers[i]
		for (const child of ns.scan(host)) {
			if (!discovered.has(child)) {
				discovered.add(child)
				allServers.push(child)
			}
		}
	}

	const growTargets = allServers
		.map((srv) => {
			const maxMoney = ns.getServerMaxMoney(srv)
			const curMoney = ns.getServerMoneyAvailable(srv)
			if (maxMoney <= 0) return null // no money here
			const ratio = curMoney / maxMoney
			if (ratio >= minRatio) return null // already mostly grown
			const growTime = ns.getGrowTime(srv)
			return { server: srv, growTime, curMoney, maxMoney }
		})
		.filter((x): x is { server: string; growTime: number; curMoney: number; maxMoney: number } => x !== null)

	// Optional: sort by growTime descending (longest first)
	growTargets.sort((a, b) => b.growTime - a.growTime)

	return growTargets
}

export async function main(ns: NS) {
	const targets = serversToGrowWithTime(ns)
	ns.tprint("Servers needing growth (with grow times):")
	for (const t of targets.slice(-8)) {
		ns.tprint(`${t.server}: ${t.curMoney}/${t.maxMoney} (${((t.curMoney / t.maxMoney) * 100).toFixed(1)}%) growTime=${(t.growTime / 1000).toFixed(2)}s`)
	}
}
