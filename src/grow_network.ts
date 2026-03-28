import { resolveTarget } from "lib/last_target"
import { launchWeakenSomewhere } from "lib/launch_weaken"
import { launchGrowSomewhere } from "lib/launch_grow"
import { WorkerCommunication } from "lib/worker_communication"
import { GrowReply, parseGrowReply } from "helpers/grow_args"
import { WeakenReply, parseWeakenReply } from "helpers/weaken_args"
/** grow_network.ts
 * Uses all available rooted server RAM to grow a target server toward max money.
 * As grow jobs finish, launches weaken jobs to offset security increase.
 * Waits for both grow and weaken completions before exiting.
 */

export async function main(ns: NS) {
	let verbose_logging = false

	const flags = ns.flags([
		["port", 1],
		["weakenPort", 2],
		["help", false],
		["v", false],
	]) as {
		port: number
		weakenPort: number
		help: boolean
		v: boolean
		_: [string]
	}

	if (flags.help) {
		ns.tprint("Usage: run grow_network.js [<Server>] [--port N] [--weakenPort N]")
		return
	}
	if (flags.v) verbose_logging = true

	const target = resolveTarget(ns, flags._[0])
	if (target == null) return

	const growPortNum = flags.port
	const weakenPortNum = flags.weakenPort

	const helperScript = "tmp/grow.ts"

	const maxMoney = ns.getServerMaxMoney(target)
	const curMoney = ns.getServerMoneyAvailable(target)

	if (maxMoney <= 0) {
		ns.tprint(`Skipping ${target}: no money available to grow`)
		return
	}

	if (curMoney >= maxMoney * 0.999999) {
		ns.tprint(`Skipping ${target}: already near max money (${curMoney}/${maxMoney})`)
		return
	}

	const safeCurMoney = Math.max(curMoney, 1)
	const growthNeeded = maxMoney / safeCurMoney
	const threadsNeeded = Math.ceil(ns.growthAnalyze(target, growthNeeded))

	if (!Number.isFinite(threadsNeeded) || threadsNeeded <= 0) {
		ns.tprint(
			`ERROR: Could not compute grow threads for ${target} ` +
			`(money=${curMoney}, max=${maxMoney}, growthNeeded=${growthNeeded})`
		)
		return
	}

	ns.tprint(
		`Preparing to grow ${target}: ` +
		`money=${ns.format.number(curMoney)} / ${ns.format.number(maxMoney)} ` +
		`growthNeeded=${growthNeeded.toFixed(4)} ` +
		`threads=${threadsNeeded}`
	)

	ns.clearPort(growPortNum)
	ns.clearPort(weakenPortNum)

	let threadsRemaining = threadsNeeded
	let pendingGrows = 0

	const launchedThreads = launchGrowSomewhere(
		ns,
		helperScript,
		target,
		threadsRemaining,
		growPortNum,
		verbose_logging
	)

	if (launchedThreads <= 0) {
		ns.tprint(`ERROR: Could not launch any grow threads for ${target}`)
		return
	}

	if (threadsRemaining > 0) {
		ns.tprint(`WARNING: Not enough RAM to fully grow ${target}. Missing ${threadsRemaining} threads.`)
	}

	// Track pending and cumulative growth
	pendingGrows = launchedThreads

	const grow_com_port = new WorkerCommunication<GrowReply>(
		ns,
		growPortNum,
		parseGrowReply
	)

	const weaken_com_port = new WorkerCommunication<WeakenReply>(
		ns,
		weakenPortNum,
		parseWeakenReply
	)

	const growSecPerThread = ns.growthAnalyzeSecurity(1)
	const weakSecPerThread = ns.weakenAnalyze(1, 1)

	let totalGrowth = 1
	let totalWeaken = 0
	let pendingWeakens = 0
	let pendingWeakSec = 0

	ns.tprint(
		`Waiting for grow replies on port ${growPortNum} and launching weaken as needed...`
	)

	while (pendingGrows > 0) {
		const growMsgs = grow_com_port.read_from_worker()

		if (growMsgs.length === 0) {
			ns.tprint("nw")
			await grow_com_port.port_handle.nextWrite()
			continue
		}

		for (const growMsg of growMsgs) {
			const { growthFactor, threads } = growMsg

			totalGrowth *= growthFactor
			pendingGrows -= threads

			pendingWeakSec += threads * growSecPerThread

			const weakThreadsToLaunch = Math.floor(pendingWeakSec / weakSecPerThread)

			if (weakThreadsToLaunch > 0) {
				const launch = launchWeakenSomewhere(ns, target, weakThreadsToLaunch, {
					helperScript: "tmp/weaken.ts",
					portNum: weakenPortNum,
					verbose: verbose_logging,
					reserveHomeRam: 0,
				})

				pendingWeakens += launch.pendingJobs
				pendingWeakSec -= launch.launchedThreads * weakSecPerThread

				if (verbose_logging) {
					ns.tprint(
						`Grow done: threads=${threads}, factor=${growthFactor.toFixed(6)} ` +
						`-> launched weakenThreads=${launch.launchedThreads}, weakenJobs=${launch.pendingJobs}, ` +
						`secDebt=${pendingWeakSec.toFixed(6)}, pendingGrows=${pendingGrows}`
					)
				}
			} else if (verbose_logging) {
				ns.tprint(
					`Grow done: threads=${threads}, factor=${growthFactor.toFixed(6)} ` +
					`-> weaken=0, secDebt=${pendingWeakSec.toFixed(6)}, pendingGrows=${pendingGrows}`
				)
			}

			if (!verbose_logging && pendingGrows % 20 === 0) {
				ns.tprint(
					`Cumulative growth factor: ${totalGrowth.toFixed(6)}, ` +
					`pendingGrows=${pendingGrows}, pendingWeakens=${pendingWeakens}, ` +
					`weakenDebt=${pendingWeakSec.toFixed(6)}`
				)
			}
		}
	}

	const finalWeakThreads = Math.ceil(pendingWeakSec / weakSecPerThread)

	if (finalWeakThreads > 0) {
		const launch = launchWeakenSomewhere(ns, target, finalWeakThreads, {
			helperScript: "tmp/weaken.ts",
			portNum: weakenPortNum,
			verbose: verbose_logging,
			reserveHomeRam: 0,
		})

		pendingWeakens += launch.pendingJobs
		pendingWeakSec -= launch.launchedThreads * weakSecPerThread

		if (verbose_logging) {
			ns.tprint(
				`Flushed final weaken debt: launched=${launch.launchedThreads}, jobs=${launch.pendingJobs}, remainingDebt=${pendingWeakSec.toFixed(6)}`
			)
		}
	}

	ns.tprint(
		`Grow phase complete. Waiting for ${pendingWeakens} weaken job(s) on port ${weakenPortNum}...`
	)

	while (pendingWeakens > 0) {
		const weakenMsgs = weaken_com_port.read_from_worker()

		if (weakenMsgs.length === 0) {
			await weaken_com_port.port_handle.nextWrite()
			continue
		}

		for (const weakenMsg of weakenMsgs) {
			const { securityReduction } = weakenMsg

			totalWeaken += securityReduction
			pendingWeakens--

			if (!verbose_logging && pendingWeakens % 20 === 0) {
				ns.tprint(
					`Total security reduction: ${totalWeaken.toFixed(4)}, pendingWeakens=${pendingWeakens}`
				)
			}

			if (verbose_logging) {
				ns.tprint(
					`Weaken done: reduction=${securityReduction.toFixed(4)}, ` +
					`totalWeaken=${totalWeaken.toFixed(4)}, pendingWeakens=${pendingWeakens}`
				)
			}
		}
	}

	ns.tprint(
		`Done growing ${target}: ` +
		`growth=${totalGrowth.toFixed(6)} ` +
		`weakened=${totalWeaken.toFixed(4)} ` +
		`finalMoney=${ns.format.number(ns.getServerMoneyAvailable(target))}/${ns.format.number(maxMoney)} ` +
		`finalSec=${ns.getServerSecurityLevel(target).toFixed(2)}`
	)
}

/** Autocomplete for server names */
export function autocomplete(data: AutocompleteData): string[] {
	return [...data.servers, "--port", "--weakenPort", "--help"]
}
