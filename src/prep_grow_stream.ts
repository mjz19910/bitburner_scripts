import { launchWeakenSomewhere } from "lib/launch_weaken"
import { WorkerCommunication } from "lib/worker_communication"

export type GrowReply = {
	type: "grow"
	growthFactor: number
	threads: number
}

export type WeakenReply = {
	type: "weaken"
	securityReduction: number
}

export type GrowAndWeakenOptions = {
	growPortNum: number
	weakenPortNum: number
	verbose?: boolean
	reserveHomeRam?: number
	weakenScript?: string
}

export type GrowAndWeakenResult = {
	totalGrowth: number
	totalWeaken: number
	finalMoney: number
	finalSecurity: number
	pendingWeakSec: number
}

function isObject(obj: unknown): obj is Record<string, unknown> {
	return typeof obj === "object" && obj !== null
}

function isMsgWithType<T extends string>(
	obj: unknown,
	type: T
): obj is { type: T } {
	return isObject(obj) && obj.type === type
}

function hasNumberKeys<K extends string>(
	obj: unknown,
	...keys: K[]
): obj is Record<K, number> {
	if (!isObject(obj)) return false
	return keys.every((k) => typeof obj[k] === "number")
}

function parseGrowReply(obj: unknown): GrowReply | null {
	return isMsgWithType(obj, "grow") &&
		hasNumberKeys(obj, "growthFactor", "threads")
		? obj
		: null
}

function parseWeakenReply(obj: unknown): WeakenReply | null {
	return isMsgWithType(obj, "weaken") &&
		hasNumberKeys(obj, "securityReduction")
		? obj
		: null
}

export async function growToMoneyGoalAndWeaken(
	ns: NS,
	target: string,
	growPendingJobs: number,
	opts: GrowAndWeakenOptions
): Promise<GrowAndWeakenResult> {
	const {
		growPortNum,
		weakenPortNum,
		verbose = false,
		reserveHomeRam = 0,
		weakenScript = "tmp/weaken.ts",
	} = opts

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

	let pendingGrows = growPendingJobs
	let pendingWeakens = 0

	let totalGrowth = 1
	let totalWeaken = 0
	let pendingWeakSec = 0

	ns.tprint(
		`Waiting for grow replies on port ${growPortNum} and launching weaken as needed...`
	)

	while (pendingGrows > 0) {
		const growMsgs = grow_com_port.read_from_worker()

		if (growMsgs.length === 0) {
			await grow_com_port.port_handle.nextWrite()
			continue
		}

		for (const growMsg of growMsgs) {
			const { growthFactor, threads } = growMsg

			totalGrowth *= growthFactor
			pendingGrows--

			// security added by this grow completion
			pendingWeakSec += threads * growSecPerThread

			// convert accumulated sec debt into weaken work
			const weakThreadsToLaunch = Math.floor(pendingWeakSec / weakSecPerThread)

			if (weakThreadsToLaunch > 0) {
				const launch = launchWeakenSomewhere(ns, target, weakThreadsToLaunch, {
					helperScript: weakenScript,
					portNum: weakenPortNum,
					verbose,
					reserveHomeRam,
				})

				pendingWeakens += launch.pendingJobs
				pendingWeakSec -= launch.launchedThreads * weakSecPerThread

				if (verbose) {
					ns.tprint(
						`Grow done: threads=${threads}, factor=${growthFactor.toFixed(6)} ` +
						`-> launched weakenThreads=${launch.launchedThreads}, weakenJobs=${launch.pendingJobs}, ` +
						`secDebt=${pendingWeakSec.toFixed(6)}, pendingGrows=${pendingGrows}`
					)
				}
			} else if (verbose) {
				ns.tprint(
					`Grow done: threads=${threads}, factor=${growthFactor.toFixed(6)} ` +
					`-> weaken=0, secDebt=${pendingWeakSec.toFixed(6)}, pendingGrows=${pendingGrows}`
				)
			}

			if (!verbose && pendingGrows % 20 === 0) {
				ns.tprint(
					`Cumulative growth factor: ${totalGrowth.toFixed(6)}, ` +
					`pendingGrows=${pendingGrows}, pendingWeakens=${pendingWeakens}, ` +
					`weakenDebt=${pendingWeakSec.toFixed(6)}`
				)
			}
		}
	}

	// flush any final leftover security debt
	const finalWeakThreads = Math.ceil(pendingWeakSec / weakSecPerThread)

	if (finalWeakThreads > 0) {
		const launch = launchWeakenSomewhere(ns, target, finalWeakThreads, {
			helperScript: weakenScript,
			portNum: weakenPortNum,
			verbose,
			reserveHomeRam,
		})

		pendingWeakens += launch.pendingJobs
		pendingWeakSec -= launch.launchedThreads * weakSecPerThread

		if (verbose) {
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

			if (!verbose && pendingWeakens % 20 === 0) {
				ns.tprint(
					`Total security reduction: ${totalWeaken.toFixed(4)}, pendingWeakens=${pendingWeakens}`
				)
			}

			if (verbose) {
				ns.tprint(
					`Weaken done: reduction=${securityReduction.toFixed(4)}, ` +
					`totalWeaken=${totalWeaken.toFixed(4)}, pendingWeakens=${pendingWeakens}`
				)
			}
		}
	}

	return {
		totalGrowth,
		totalWeaken,
		finalMoney: ns.getServerMoneyAvailable(target),
		finalSecurity: ns.getServerSecurityLevel(target),
		pendingWeakSec,
	}
}
