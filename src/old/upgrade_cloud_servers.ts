export async function main(ns: NS) {
	ns.disableLog("ALL")
	ns.ui.openTail()
	const hosts = ns.cloud.getServerNames()
	if (!hosts) return ns.print("no servers to upgrade")
	const ram_sizes: { [x: string]: number } = {}
	for (const host of hosts) {
		const max_ram = ns.getServerMaxRam(host)
		ram_sizes[host] = max_ram
	}
	const last_host = hosts.at(-1)!
	let req_ram = ram_sizes[last_host] * 2
	let ram_upgrade_cost = ns.cloud.getServerUpgradeCost(last_host, req_ram)
	if (ram_upgrade_cost < 0) {
		ns.print("neg cost ")
		ns.print([last_host, ram_sizes[last_host]])
		return
	}
	const calcWidth = (chars: number) => chars * (16 / 2.5) + 3
	let width = calcWidth(47) + 61.185
	ns.ui.resizeTail(width, 35 + 24 * 5)
	let lines = 1
	ns.print("last upgrade cost ", ns.format.number(ram_upgrade_cost))
	lines++
	let moneyLeft = ns.getServerMoneyAvailable("home")
	wl: while (ram_upgrade_cost < moneyLeft) {
		for (const host of hosts) {
			if (req_ram <= ram_sizes[host]) continue
			lines++
			ram_upgrade_cost = ns.cloud.getServerUpgradeCost(host, req_ram)
			if (ram_upgrade_cost < 0) {
				ns.print("neg cost ", [host, req_ram, ram_sizes[host]])
				return
			}
			ns.print(host, " upgrade cost ", ns.format.number(ram_upgrade_cost))
			lines++
			ns.cloud.upgradeServer(host, req_ram)
			moneyLeft -= ram_upgrade_cost
			if (moneyLeft < ram_upgrade_cost) break wl
		}
		req_ram *= 2
	}
	lines++
	ns.ui.moveTail(640 + 1080, 70)
	ns.ui.resizeTail(width, Math.min(ns.ui.windowSize()[1] - 160, 35 + 24 * lines))
}