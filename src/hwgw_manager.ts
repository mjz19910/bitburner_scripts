import { NS, ScriptArg, Server } from "@ns";
import { Com, HGWReply, HGWRequest } from "./com";

enum DepPaths {
	hack_worker = "tmp/hack_worker.ts",
	grow_worker = "tmp/grow_worker.ts",
	weaken_worker = "tmp/weaken_worker.ts",
	com = "old/com.ts",
}

type BatchState = {
	runner: string;
	target: string;
	batchId: number;
	pending: number;
};

const activeBatches = new Map<number, BatchState>(); // batchId -> batch
const activeByRunner = new Map<string, Set<number>>(); // runner -> batch ids

function addBatch(state: BatchState) {
	activeBatches.set(state.batchId, state);

	let set = activeByRunner.get(state.runner);
	if (!set) {
		set = new Set<number>();
		activeByRunner.set(state.runner, set);
	}
	set.add(state.batchId);
}

function removeBatch(batchId: number) {
	const state = activeBatches.get(batchId);
	if (!state) return;

	activeBatches.delete(batchId);

	const set = activeByRunner.get(state.runner);
	if (set) {
		set.delete(batchId);
		if (set.size === 0) activeByRunner.delete(state.runner);
	}
}

let logging = false;

let nextTargetIndex = 0;
let nextBatchId = 0;

function fillRunner(ns: NS, targets: string[], runner: string) {
	let launched = 0;

	for (let i = 0; i < targets.length; i++) {
		const target = pickNextTarget(targets, nextTargetIndex);
		nextTargetIndex = (nextTargetIndex + 1) % targets.length;

		const ramCap = runner === "home" ? 0.80 : 1.0;
		const batchId = nextBatchId++;

		const result = scheduleDynamicHWGW(ns, target, runner, batchId, ramCap);
		if (!result) continue;
		if (result.scheduledCount === 0) {
			throw new Error("Invalid state");
		}

		addBatch({
			runner,
			target,
			batchId,
			pending: result.scheduledCount,
		});

		if (result.scheduledCount < 4) {
			ns.tprint("partial batch ", batchId);
		}

		if (logging) {
			const sched = result.scheduledCount;
			ns.tprint(
				`[${runner}] batch=${batchId} target=${target} sched=${sched}`,
			);
		}
		launched++;
	}

	return launched;
}

const worker_paths: DepPaths[] = [
	DepPaths.com,
	DepPaths.hack_worker,
	DepPaths.grow_worker,
	DepPaths.weaken_worker,
];

function round_num(num: number, max: number) {
	return Math.round(num * max) / max;
}

export async function main(ns: NS) {
	const f = ns.flags([["logging", false]]) as {
		logging: boolean;
		_: ScriptArg[];
	};
	logging = f.logging;

	ns.disableLog("disableLog");
	ns.disableLog("getServerRequiredHackingLevel");
	ns.disableLog("getServerMaxMoney");
	ns.disableLog("getServerUsedRam");
	ns.disableLog("getServerMaxRam");
	ns.disableLog("getHackingLevel");
	ns.disableLog("sleep");
	ns.disableLog("exec");
	ns.disableLog("scan");
	ns.disableLog("scp");

	const requestedTargets = parseTargetArgs(f._);
	const allServers = await scanAndRootServers(ns);
	const usableServers = filterUsableServers(ns, allServers);
	deployScripts(ns, worker_paths, usableServers);

	const targets = getHackTargets(ns, allServers, requestedTargets);

	ns.tprint(
		`Dynamic HWGW manager controlling ${usableServers.length} workers across ${targets.length} targets`,
	);

	const c = new Com<HGWReply>(ns, 1);

	// Initial fill: use every worker once
	for (const runner of usableServers) {
		fillRunner(ns, targets, runner);
		await ns.sleep(200);
	}

	let msg;
	while (true) {
		while ((msg = c.readOrUndefined())) {
			const r = msg;
			if (logging) {
				if (r.type === "hack") {
					const { data: { data: money, server, batchId, target } } =
						r;
					if (money > 0.01) {
						ns.tprint(
							`[${server}] ${r.type} batch=${batchId} target=${target} $${
								ns.format.number(money, 2)
							}`,
						);
					}
				}
			}
			if (r.type === "grow") {
				const { data: s } = r;
				if (s.data > 0) {
					const growth = round_num(s.data, 1e18) - 1;
					const grow_percent = round_num(growth * 100, 1e18);
					ns.tprint(
						`[${s.server}] ${r.type} batch=${s.batchId} target=${r.data.target} `,
						grow_percent,
						"%",
					);
				}
			}
			if (r.type === "weaken") {
				const { data: s } = r;
				if (s.data > 0) {
					const weakened = round_num(s.data, 1e19);
					ns.tprint(
						`[${r.data.server}] ${r.type} batch=${r.data.batchId} target=${r.data.target} `,
						weakened,
					);
				}
			}
			const batch = activeBatches.get(r.data.batchId);
			if (!batch) continue;

			if (r.data.batchId !== batch.batchId) continue;

			batch.pending--;

			if (batch.pending < 0) removeBatch(batch.batchId);

			const runner = batch.runner;
			fillRunner(ns, targets, runner);
		}
		await ns.sleep(200);
	}
}

/** Filter usable servers */
function filterUsableServers(ns: NS, servers: string[]): string[] {
	return servers.filter((s) =>
		ns.hasRootAccess(s) && ns.getServerMaxRam(s) > 0
	);
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
		if (
			!ns.hasRootAccess(server) && !ns.getServer(server).purchasedByPlayer
		) {
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
		const srv = ns.getServer(server) as Server;
		let openedPorts = srv.openPortCount!;

		if (ns.fileExists("BruteSSH.exe", "home") && !srv.sshPortOpen) {
			ns.brutessh(server);
			openedPorts++;
		}
		if (ns.fileExists("FTPCrack.exe", "home") && !srv.ftpPortOpen) {
			ns.ftpcrack(server);
			openedPorts++;
		}
		if (ns.fileExists("relaySMTP.exe", "home") && !srv.smtpPortOpen) {
			ns.relaysmtp(server);
			openedPorts++;
		}
		if (ns.fileExists("HTTPWorm.exe", "home") && !srv.httpPortOpen) {
			ns.httpworm(server);
			openedPorts++;
		}
		if (ns.fileExists("SQLInject.exe", "home") && !srv.sqlPortOpen) {
			ns.sqlinject(server);
			openedPorts++;
		}

		if (openedPorts >= srv.numOpenPortsRequired!) {
			ns.nuke(server);
			ns.tprint(`Rooted ${server}`);
			await ns.sleep(250);
		}
	} catch (e) {
		ns.tprint(`Failed to root ${server}: ${e}`);
	}
}

type ScheduleResult = {
	scheduledCount: number;
};

type HWGWThreadCounts = {
	hackThreads: number;
	growThreads: number;
	weakenHackThreads: number;
	weakenGrowThreads: number;
};

function getBatchRamCost(ns: NS, threads: HWGWThreadCounts): number | null {
	if (!threads) return null;

	const weakenRam = ns.getScriptRam(DepPaths.weaken_worker, "home");
	const hackRam = ns.getScriptRam(DepPaths.hack_worker, "home");
	const growRam = ns.getScriptRam(DepPaths.grow_worker, "home");

	return (
		threads.weakenHackThreads * weakenRam +
		threads.hackThreads * hackRam +
		threads.growThreads * growRam +
		threads.weakenGrowThreads * weakenRam
	);
}

function launchHWGWTasksStrict(
	ns: NS,
	runner: string,
	batchId: number,
	target: string,
	threads: ReturnType<typeof computeHWGWThreads>,
	delays: ReturnType<typeof computeHWGWDelays>,
): {
	scheduledCount: number;
} | null {
	if (!threads) return null;

	const tasks: Task[] = [
		{
			type: "hack",
			script: DepPaths.hack_worker,
			threads: threads.hackThreads,
			delay: delays.hackDelay,
		},
		{
			type: "weaken",
			script: DepPaths.weaken_worker,
			threads: threads.weakenHackThreads,
			delay: delays.weaken1Delay,
		},
		{
			type: "grow",
			script: DepPaths.grow_worker,
			threads: threads.growThreads,
			delay: delays.growDelay,
		},
		{
			type: "weaken",
			script: DepPaths.weaken_worker,
			threads: threads.weakenGrowThreads,
			delay: delays.weaken2Delay,
		},
	];

	for (const task of tasks) {
		if (task.threads <= 0) continue;

		const ramPerThread = ns.getScriptRam(task.script, runner);
		if (ramPerThread <= 0) {
			ns.tprint(
				`[WARN] Invalid RAM cost for ${task.script} on ${runner}`,
			);
			return null;
		}
	}

	let scheduledCount = 0;

	for (const task of tasks) {
		if (task.threads <= 0) continue;

		const req = new HGWRequest(task.type, {
			server: runner,
			target,
			offset: task.delay,
			batchId,
			port: 1,
			time: Date.now(),
		});

		const pid = ns.exec(
			task.script,
			runner,
			task.threads,
			...req.to_args(),
		);
		if (pid === 0) {
			ns.tprint(
				`[WARN] Failed to launch full ${task.type} x${task.threads} on ${runner} for ${target}`,
			);
			return null;
		}

		scheduledCount++;
	}

	return { scheduledCount };
}

function scheduleDynamicHWGW(
	ns: NS,
	target: string,
	server: string,
	batchId: number,
	ramCapPercent: number,
): ScheduleResult | null {
	const maxRam = ns.getServerMaxRam(server);
	const usedRam = ns.getServerUsedRam(server);
	const allowedRam = Math.floor(maxRam * ramCapPercent);
	const freeRam = allowedRam - usedRam;

	if (freeRam <= 0) return null;

	// Target sanity
	if (ns.getServerMaxMoney(target) <= 0) return null;
	if (ns.getServerRequiredHackingLevel(target) > ns.getHackingLevel()) {
		return null;
	}

	// Full batch threads (do not scale down for packed batching)
	const threads = computeHWGWThreads(ns, target);
	if (!threads) return null;

	const requiredRam = getBatchRamCost(ns, threads);
	if (requiredRam === null) return null;
	if (requiredRam > freeRam) return null;

	const delays = computeHWGWDelays(ns, target);
	const launched = launchHWGWTasksStrict(
		ns,
		server,
		batchId,
		target,
		threads,
		delays,
	);
	if (!launched) return null;

	return {
		scheduledCount: launched.scheduledCount,
	};
}

function computeHWGWThreads(ns: NS, target: string): HWGWThreadCounts | null {
	const hackFrac = ns.hackAnalyze(target);
	if (hackFrac <= 0 || !isFinite(hackFrac)) return null;

	const desiredHackPct = 0.05;

	const rawHackThreads = desiredHackPct / hackFrac;
	if (!isFinite(rawHackThreads) || rawHackThreads <= 0) return null;

	const rawGrowThreads = ns.growthAnalyze(target, 1 / (1 - desiredHackPct));
	if (!isFinite(rawGrowThreads) || rawGrowThreads <= 0) return null;

	const weakenPerThread = ns.weakenAnalyze(1);
	if (!isFinite(weakenPerThread) || weakenPerThread <= 0) return null;

	const anal_hack_security = ns.hackAnalyzeSecurity(rawHackThreads);
	const rawWeakenHackThreads = anal_hack_security / weakenPerThread;

	const anal_growth_security = ns.growthAnalyzeSecurity(rawGrowThreads);
	const rawWeakenGrowThreads = anal_growth_security / weakenPerThread;

	const hackThreads = Math.max(1, Math.ceil(rawHackThreads));
	const growThreads = Math.max(1, Math.ceil(rawGrowThreads));
	const weakenHackThreads = Math.max(1, Math.ceil(rawWeakenHackThreads));
	const weakenGrowThreads = Math.max(1, Math.ceil(rawWeakenGrowThreads));

	return {
		hackThreads,
		growThreads,
		weakenHackThreads,
		weakenGrowThreads,
	};
}

function computeHWGWDelays(ns: NS, target: string) {
	const hackTime = ns.getHackTime(target);
	const growTime = ns.getGrowTime(target);
	const weakenTime = ns.getWeakenTime(target);
	const gap = 200;

	const weaken1Finish = weakenTime;
	const hackFinish = weaken1Finish - gap;
	const growFinish = weaken1Finish + gap;
	const weaken2Finish = weaken1Finish + gap * 2;

	return {
		hackDelay: Math.max(0, hackFinish - hackTime),
		weaken1Delay: Math.max(0, weaken1Finish - weakenTime),
		growDelay: Math.max(0, growFinish - growTime),
		weaken2Delay: Math.max(0, weaken2Finish - weakenTime),
	};
}

interface Task {
	type: "hack" | "grow" | "weaken";
	script: string;
	threads: number;
	delay: number;
}

function getHackTargets(
	ns: NS,
	servers: string[],
	requested?: string[],
): string[] {
	const hackingLevel = ns.getHackingLevel();
	const requestedSet = requested ? new Set(requested) : null;

	return servers
		.filter((s) => {
			const srv = ns.getServer(s) as Server;
			return ns.hasRootAccess(s) &&
				!srv.purchasedByPlayer &&
				srv.moneyMax! > 0 &&
				srv.hackDifficulty! / 2 <= hackingLevel &&
				(!requestedSet || requestedSet.has(s));
		})
		.sort((a, b) => {
			const scoreA = scoreTarget(ns, a);
			const scoreB = scoreTarget(ns, b);
			return scoreB - scoreA;
		});
}

function scoreTarget(ns: NS, server: string): number {
	const money = ns.getServerMaxMoney(server);
	const weaken_time = ns.getWeakenTime(server);
	if (money <= 0 || weaken_time <= 0) return 0;
	return money / weaken_time;
}

function pickNextTarget(targets: string[], index: number): string {
	if (targets.length === 0) return "n00dles";
	return targets[index % targets.length];
}

function parseTargetArgs(
	args: (string | number | boolean)[],
): string[] | undefined {
	const out: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (typeof arg !== "string") continue;

		// --targets foodnstuff,n00dles
		if (arg === "--targets") {
			const next = args[i + 1];
			if (typeof next === "string") {
				out.push(
					...next.split(",").map((s) => s.trim()).filter(Boolean),
				);
				i++;
				continue;
			}
		}

		// positional hostnames: run manager.ts foodnstuff n00dles
		if (!arg.startsWith("--")) {
			out.push(arg);
		}
	}

	return out.length > 0 ? [...new Set(out)] : undefined;
}
