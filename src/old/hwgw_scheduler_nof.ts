import { Com, HGWRequest, HGWReply } from "com"

enum DepPaths {
	hack_worker = "tmp/hack_worker.ts",
	grow_worker = "tmp/grow_worker.ts",
	weaken_worker = "tmp/weaken_worker.ts",
	com = "com.ts"
}

type BatchState = {
	runner: string
	target: string
	batchId: number
	pending: number
}

const activeBatches = new Map<number, BatchState>() // batchId -> batch
const activeByRunner = new Map<string, Set<number>>() // runner -> batch ids

function addBatch(state: BatchState) {
	activeBatches.set(state.batchId, state)

	let set = activeByRunner.get(state.runner)
	if (!set) {
		set = new Set<number>()
		activeByRunner.set(state.runner, set)
	}
	set.add(state.batchId)
}


function removeBatch(batchId: number) {
	const state = activeBatches.get(batchId)
	if (!state) return

	activeBatches.delete(batchId)

	const set = activeByRunner.get(state.runner)
	if (set) {
		set.delete(batchId)
		if (set.size === 0) activeByRunner.delete(state.runner)
	}
}

let logging = false

let nextTargetIndex = 0
let nextBatchId = 0

async function fillRunner(ns: NS, targets: string[], runner: string) {
	let launched = 0

	for (let i = 0; i < targets.length; i++) {
		const target = pickNextTarget(targets, nextTargetIndex)
		nextTargetIndex = (nextTargetIndex + 1) % targets.length

		const ramCap = runner === "home" ? 0.80 : 1.0
		const batchId = nextBatchId++

		const result = await scheduleDynamicHWGW(ns, target, runner, batchId, ramCap)
		if (!result) continue
		if (result.scheduledCount === 0) {
			throw new Error("Invalid state")
		}

		addBatch({
			runner,
			target,
			batchId,
			pending: result.scheduledCount,
		})

		if (result.scheduledCount < 4) {
			ns.tprint("partial batch ", batchId)
		}

		if (logging) {
			const sched = result.scheduledCount
			ns.tprint(`[${runner}] batch=${batchId} target=${target} sched=${sched}`)
		}
		launched++
		if (launched % 32 === 0) await ns.sleep(20)
	}

	return launched
}

const worker_paths: DepPaths[] = [
	DepPaths.com,
	DepPaths.hack_worker,
	DepPaths.grow_worker,
	DepPaths.weaken_worker,
];

export async function main(ns: NS) {
	const f = ns.flags([["logging", false]]) as {
		logging: boolean
		_: ScriptArg[]
	}
	logging = f.logging;

	ns.disableLog("disableLog")
	ns.disableLog("getServerRequiredHackingLevel")
	ns.disableLog("getServerMaxMoney")
	ns.disableLog("getServerUsedRam")
	ns.disableLog("getServerMaxRam")
	ns.disableLog("getHackingLevel")
	ns.disableLog("sleep")
	ns.disableLog("exec")
	ns.disableLog("scan")
	ns.disableLog("kill")
	ns.disableLog("scp")

	const requestedTargets = parseTargetArgs(f._)
	const allServers = await scanAndRootServers(ns)
	const usableServers = filterUsableServers(ns, allServers)
	deployScripts(ns, worker_paths, usableServers)

	const targets = getHackTargets(ns, allServers, requestedTargets)

	ns.print(`Dynamic HWGW manager controlling ${usableServers.length} workers across ${targets.length} targets`)


	const c = new Com(ns, 1)

	ns.ui.openTail()

	// Initial fill: use every worker once
	for (const runner of usableServers) {
		await fillRunner(ns, targets, runner)
	}

	let msg
	while (true) {
		while ((msg = c.readOrUndefined<HGWReply>())) {
			const r = msg.raw()

			if (r.type === "hack") {
				if (r.data > 0.01) {
					ns.tprint(`[${r.server}] batch=${r.batchId} target=${r.target} hack=$${ns.format.number(r.data, 2)}`);
				}
			} else if (r.type === "grow") {
				if (r.data > 1.000001) {
					ns.tprint(`[${r.server}] batch=${r.batchId} target=${r.target} grow=${ns.format.number(r.data, 8)}`);
				}
			} else if (r.type === "weaken") {
				if (r.data > 0.0001) {
					ns.tprint(`[${r.server}] batch=${r.batchId} target=${r.target} weaken=${ns.format.number(r.data, 4)}`);
				}
			}

			const batch = activeBatches.get(r.batchId)
			if (!batch) continue

			if (r.batchId !== batch.batchId) continue

			batch.pending--

			if (batch.pending <= 0) {
				const runner = batch.runner
				removeBatch(batch.batchId)
				await fillRunner(ns, targets, runner)
			}
		}
		await ns.sleep(0)
	}
}

/** Filter usable servers */
function filterUsableServers(ns: NS, servers: string[]): string[] {
	return servers.filter(s => ns.hasRootAccess(s) && ns.getServerMaxRam(s) > 0);
}

/** Deploy scripts to all usable servers */
function deployScripts(ns: NS, scripts: string[], servers: string[]) {
	for (const s of servers) ns.scp(scripts, s);
}

/** BFS scan all servers and attempt to root them if possible */
async function scanAndRootServers(ns: NS): Promise<string[]> {
	const visited = new Set<string>();
	const queue: string[] = ["home"];
	let head = 0;

	while (head < queue.length) {
		const server = queue[head++];
		if (visited.has(server)) continue;
		visited.add(server);

		// Attempt to gain root if not already
		if (!ns.hasRootAccess(server) && !ns.getServer(server).purchasedByPlayer) {
			await tryRoot(ns, server);
		}

		for (const next of ns.scan(server)) {
			if (!visited.has(next)) queue.push(next);
		}
	}

	return Array.from(visited);
}

/** Attempt to root a server using available port tools */
async function tryRoot(ns: NS, server: string) {
	try {
		const serv = ns.getServer(server) as Server;
		let openedPorts = serv.openPortCount!;

		if (ns.fileExists("BruteSSH.exe", "home") && !serv.sshPortOpen) {
			ns.brutessh(server);
			openedPorts++;
		}
		if (ns.fileExists("FTPCrack.exe", "home") && !serv.ftpPortOpen) {
			ns.ftpcrack(server);
			openedPorts++;
		}
		if (ns.fileExists("relaySMTP.exe", "home") && !serv.smtpPortOpen) {
			ns.relaysmtp(server);
			openedPorts++;
		}
		if (ns.fileExists("HTTPWorm.exe", "home") && !serv.httpPortOpen) {
			ns.httpworm(server);
			openedPorts++;
		}
		if (ns.fileExists("SQLInject.exe", "home") && !serv.sqlPortOpen) {
			ns.sqlinject(server);
			openedPorts++;
		}

		if (openedPorts >= serv.numOpenPortsRequired!) {
			ns.nuke(server);
			ns.tprint(`Rooted ${server}`);
			await ns.sleep(0);
		}
	} catch (e) {
		ns.tprint(`Failed to root ${server}: ${e}`);
	}
}

type ScheduleResult = {
	scheduledCount: number
}

type HWGWThreadCounts = {
	hackThreads: number;
	growThreads: number;
	weakenHackThreads: number;
	weakenGrowThreads: number;
}

function getBatchRamCost(ns: NS, threads: HWGWThreadCounts): number | null {
	if (!threads) return null

	const weakenRam = ns.getScriptRam(DepPaths.weaken_worker, "home")
	const hackRam = ns.getScriptRam(DepPaths.hack_worker, "home")
	const growRam = ns.getScriptRam(DepPaths.grow_worker, "home")

	return (
		threads.weakenHackThreads * weakenRam +
		threads.hackThreads * hackRam +
		threads.growThreads * growRam +
		threads.weakenGrowThreads * weakenRam
	)
}

class HWGWDelays {
	// offsets
	hackDelay: number;
	weakenHackDelay: number;
	growDelay: number;
	weakenGrowDelay: number;

	// end estimate
	hackFinish: number;
	weakenHackFinish: number;
	growFinish: number;
	weakenGrowFinish: number;
	allFinish: number;

	constructor(ns: NS, target: string) {
		const hackTime = ns.getHackTime(target)
		const growTime = ns.getGrowTime(target)
		const weakenTime = ns.getWeakenTime(target)
		const gap = 200 // spacing between tasks in ms

		// Calculate desired finish times
		const hackFinish = weakenTime - gap
		const weaken1Finish = weakenTime
		const growFinish = weakenTime + gap
		const weaken2Finish = growFinish + gap

		this.hackDelay = Math.max(0, hackFinish - hackTime)
		this.weakenHackDelay = Math.max(0, weaken1Finish - weakenTime)
		this.growDelay = Math.max(0, growFinish - growTime)
		this.weakenGrowDelay = Math.max(0, weaken2Finish - weakenTime)

		this.hackFinish = this.hackDelay + hackTime
		this.weakenHackFinish = this.weakenHackDelay + weakenTime
		this.growFinish = this.growDelay + growTime
		this.weakenGrowFinish = this.weakenGrowDelay + weakenTime

		this.allFinish = Math.max(this.hackFinish, this.weakenHackFinish, this.growFinish, this.weakenGrowFinish)
	}


	/** Shift the entire batch by delta ms */
	shiftEnd(delta: number) {
		// Shift finish times
		this.hackFinish += delta
		this.weakenHackFinish += delta
		this.growFinish += delta
		this.weakenGrowFinish += delta
		this.allFinish += delta

		// Update delays accordingly
		const hackTime = this.hackFinish - this.hackDelay
		const weakenHackTime = this.weakenHackFinish - this.weakenHackDelay
		const growTime = this.growFinish - this.growDelay
		const weakenGrowTime = this.weakenGrowFinish - this.weakenGrowDelay

		this.hackDelay = Math.max(0, this.hackFinish - hackTime)
		this.weakenHackDelay = Math.max(0, this.weakenHackFinish - weakenHackTime)
		this.growDelay = Math.max(0, this.growFinish - growTime)
		this.weakenGrowDelay = Math.max(0, this.weakenGrowFinish - weakenGrowTime)
	}
}

async function launchHWGWTasksStrict(
	ns: NS,
	runner: string,
	batchId: number,
	target: string,
	threads: ReturnType<typeof computeHWGWThreads>,
	delays: HWGWDelays
): Promise<{ scheduledCount: number; } | null> {
	if (!threads) return null

	const tasks: Task[] = [
		{ type: "hack", script: DepPaths.hack_worker, threads: threads.hackThreads, getDelay: () => delays.hackDelay },
		{ type: "weaken", script: DepPaths.weaken_worker, threads: threads.weakenHackThreads, getDelay: () => delays.weakenHackDelay },
		{ type: "grow", script: DepPaths.grow_worker, threads: threads.growThreads, getDelay: () => delays.growDelay },
		{ type: "weaken", script: DepPaths.weaken_worker, threads: threads.weakenGrowThreads, getDelay: () => delays.weakenGrowDelay },
	];

	for (const task of tasks) {
		if (task.threads <= 0) continue

		const ramPerThread = ns.getScriptRam(task.script, runner)
		if (ramPerThread <= 0) {
			ns.tprint(`[WARN] Invalid RAM cost for ${task.script} on ${runner}`)
			return null
		}
	}

	let groups = 0
	outer: for (; ; groups++) {
		let cur_group_pids: number[] = []
		for (const task of tasks) {
			if (task.threads <= 0) continue

			const req = HGWRequest.from_raw({
				type: task.type,
				server: runner,
				target,
				offset: task.getDelay(),
				batchId,
				port: 1,
			})

			const pid = ns.exec(task.script, runner, task.threads, ...req.to_args())
			if (pid === 0) {
				for (const pid of cur_group_pids) {
					ns.kill(pid)
				}
				break outer
			}

			cur_group_pids.push(pid);
		}

		await ns.sleep(0);

		const minShift = 500       // minimum spacing in ms
		const maxShift = 60_000    // maximum spacing in ms
		const scaleFactor = 0.1    // fraction of allFinish to use as shift

		// formulaic shift
		let delta = delays.allFinish * scaleFactor

		// clamp to min/max
		delta = Math.max(minShift, Math.min(delta, maxShift))

		delays.shiftEnd(delta)
	}
	return { scheduledCount: groups * tasks.length };
}

async function scheduleDynamicHWGW(
	ns: NS,
	target: string,
	server: string,
	batchId: number,
	ramCapPercent: number,
) {
	const maxRam = ns.getServerMaxRam(server)
	const usedRam = ns.getServerUsedRam(server)
	const allowedRam = Math.floor(maxRam * ramCapPercent)
	const freeRam = allowedRam - usedRam
	if (freeRam <= 0) return null

	if (ns.getServerMaxMoney(target) <= 0) return null
	if (ns.getServerRequiredHackingLevel(target) > ns.getHackingLevel() * 1.15) return null
	const threads = computeHWGWThreads(ns, target)
	if (!threads) return null
	const requiredRam = getBatchRamCost(ns, threads)
	if (requiredRam === null) return null
	if (requiredRam > freeRam) return null
	const delays = new HWGWDelays(ns, target)
	const launched = await launchHWGWTasksStrict(ns, server, batchId, target, threads, delays)
	if (!launched) return null

	const { scheduledCount } = launched
	const ret: ScheduleResult = { scheduledCount }
	return ret;
}

function computeHWGWThreads(ns: NS, target: string): HWGWThreadCounts | null {
	const hackFrac = ns.hackAnalyze(target)
	if (hackFrac <= 0 || !isFinite(hackFrac)) return null

	const desiredHackPct = 0.05

	const rawHackThreads = desiredHackPct / hackFrac
	if (!isFinite(rawHackThreads) || rawHackThreads <= 0) return null

	const rawGrowThreads = ns.growthAnalyze(target, 1 / (1 - desiredHackPct))
	if (!isFinite(rawGrowThreads) || rawGrowThreads <= 0) return null

	const weakenPerThread = ns.weakenAnalyze(1)
	if (!isFinite(weakenPerThread) || weakenPerThread <= 0) return null

	const anal_hack_security = ns.hackAnalyzeSecurity(rawHackThreads)
	const rawWeakenHackThreads = anal_hack_security / weakenPerThread

	const anal_growth_security = ns.growthAnalyzeSecurity(rawGrowThreads)
	const rawWeakenGrowThreads = anal_growth_security / weakenPerThread

	const hackThreads = Math.max(1, Math.ceil(rawHackThreads))
	const growThreads = Math.max(1, Math.ceil(rawGrowThreads))
	const weakenHackThreads = Math.max(1, Math.ceil(rawWeakenHackThreads))
	const weakenGrowThreads = Math.max(1, Math.ceil(rawWeakenGrowThreads))

	return {
		hackThreads,
		growThreads,
		weakenHackThreads,
		weakenGrowThreads,
	}
}

interface Task {
	type: "hack" | "grow" | "weaken"
	script: string
	threads: number
	getDelay: () => number
}

function getHackTargets(ns: NS, servers: string[], requested?: string[]): string[] {
	const hackingLevel = ns.getHackingLevel()
	const requestedSet = requested ? new Set(requested) : null

	return servers
		.filter(s => {
			const srv = ns.getServer(s) as Server
			return ns.hasRootAccess(s) &&
				!srv.purchasedByPlayer &&
				srv.moneyMax! > 0 &&
				srv.hackDifficulty! <= hackingLevel &&
				(!requestedSet || requestedSet.has(s))
		})
		.sort((a, b) => {
			const scoreA = scoreTarget(ns, a)
			const scoreB = scoreTarget(ns, b)
			return scoreB - scoreA
		})
}

function scoreTarget(ns: NS, server: string): number {
	const money = ns.getServerMaxMoney(server)
	const weaken_time = ns.getWeakenTime(server)
	if (money <= 0 || weaken_time <= 0) return 0
	return money / weaken_time
}

function pickNextTarget(targets: string[], index: number): string {
	if (targets.length === 0) return "n00dles"
	return targets[index % targets.length]
}

function parseTargetArgs(args: (string | number | boolean)[]): string[] | undefined {
	const out: string[] = []

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]

		if (typeof arg !== "string") continue

		// --targets foodnstuff,n00dles
		if (arg === "--targets") {
			const next = args[i + 1]
			if (typeof next === "string") {
				out.push(...next.split(",").map(s => s.trim()).filter(Boolean))
				i++
				continue
			}
		}

		// positional hostnames: run manager.ts foodnstuff n00dles
		if (!arg.startsWith("--")) {
			out.push(arg)
		}
	}

	return out.length > 0 ? [...new Set(out)] : undefined
}

export function autocomplete(data: AutocompleteData, _args: ScriptArg[]) {
	return ["--tail", "--logging", ...data.servers]
}