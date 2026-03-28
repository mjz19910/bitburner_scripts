import { NS } from "@ns";
import { build_script_args } from "./args";
import { add_tag, omit_default } from "./helpers";
import { GrowArgs } from "./grow_args";

export type LaunchGrowOptions = {
	helperScript?: string;
	portNum?: number;
	verbose?: boolean;
	reserveHomeRam?: number;
};

type LaunchGrowResult = {
	launchedThreads: number;
	threadsRemaining: number;
	pendingJobs: number;
	hostsUsed: { host: string; threads: number; pid: number }[];
};

/** Try to launch grow threads on all rooted servers until threadsRemaining <= 0
 * Returns the total threads actually launched
 */
export function launchGrowSomewhere(
	ns: NS,
	target: string,
	threadsRemaining: number,
	opts: LaunchGrowOptions = {},
): LaunchGrowResult {
	const helperScript = opts.helperScript ?? "tmp/grow.ts";
	const portNum = opts.portNum ?? 1;
	const verbose = opts.verbose ?? false;
	const reserveHomeRam = opts.reserveHomeRam ?? 0;

	const scriptRam = ns.getScriptRam(helperScript);

	const allServers: string[] = ["home"];
	const discovered = new Set(allServers);

	// Discover all servers
	for (let i = 0; i < allServers.length; i++) {
		const host = allServers[i];
		for (const child of ns.scan(host)) {
			if (!discovered.has(child)) {
				discovered.add(child);
				allServers.push(child);
			}
		}
	}

	let launchedThreads = 0;
	let pendingJobs = 0;
	const hostsUsed: { host: string; threads: number; pid: number }[] = [];

	for (const host of allServers) {
		if (host === "home") continue;

		if (!ns.hasRootAccess(host)) {
			if (verbose) ns.tprint(`Skipping ${host}: no root access`);
			continue;
		}

		const maxMoney = ns.getServerMaxMoney(host);
		if (maxMoney <= 0) {
			if (verbose) ns.tprint(`Skipping ${host}: max money is zero`);
			continue;
		}

		const maxRam = ns.getServerMaxRam(host);
		const usedRam = ns.getServerUsedRam(host);

		const reserve = host === "home" ? reserveHomeRam : 0;
		const availRam = Math.max(0, maxRam - usedRam - reserve);

		let threadsCanRun = Math.floor(availRam / scriptRam);
		if (threadsCanRun <= 0) continue;
		if (threadsCanRun > threadsRemaining) threadsCanRun = threadsRemaining;

		if (verbose) {
			ns.tprint(
				`Launching ${threadsCanRun} threads on ${host} to grow ${target}`,
			);
		}

		if (host !== "home") {
			for (const prevFile of ns.ls(host, "/helpers/")) {
				ns.rm(prevFile, host);
			}
			ns.rm(helperScript, host);
			ns.scp(helperScript, host);
			ns.scp(ns.ls("home", "/helpers/"), host);
			ns.rm("helper.ts", host);
			ns.scp("helper.ts", host);
		}

		const args = build_script_args<GrowArgs>({
			_: [
				add_tag("runner", host),
				add_tag("threads", threadsCanRun),
				add_tag("target", target),
			],
			help: false,
			port: portNum,
		}, { port: 1 });

		const pid = ns.exec(helperScript, host, threadsCanRun, ...args);

		if (pid === 0) {
			ns.tprint(`Failed to launch ${helperScript} on ${host}`);
			continue;
		} else {
			pendingJobs++;
		}

		launchedThreads += threadsCanRun;
		threadsRemaining -= threadsCanRun;
		hostsUsed.push({ host, threads: threadsCanRun, pid });
	}

	return {
		launchedThreads,
		threadsRemaining,
		pendingJobs,
		hostsUsed,
	};
}
