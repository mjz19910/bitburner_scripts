import { NS } from "@ns";
import { build_script_args } from "./args";
import { add_tag } from "./helpers";
import { WeakenArgs } from "./weaken_args";

export type LaunchWeakenOptions = {
	helperScript?: string;
	portNum?: number;
	verbose?: boolean;
	reserveHomeRam?: number;
};

export type LaunchWeakenResult = {
	launchedThreads: number;
	threadsRemaining: number;
	pendingJobs: number;
	hostsUsed: { host: string; threads: number; pid: number }[];
};

export function launchWeakenSomewhere(
	ns: NS,
	target: string,
	threadsRemaining: number,
	opts: LaunchWeakenOptions = {},
): LaunchWeakenResult {
	const helperScript = opts.helperScript ?? "tmp/weaken.ts";
	const portNum = opts.portNum ?? 1;
	const verbose = opts.verbose ?? false;
	const reserveHomeRam = opts.reserveHomeRam ?? 0;

	const scriptRam = ns.getScriptRam(helperScript);

	// discover all servers
	const allServers: string[] = ["home"];
	const discovered = new Set(allServers);

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
		if (threadsRemaining <= 0) break;
		if (!ns.hasRootAccess(host)) {
			if (verbose) ns.print(`Skipping ${host}: no root access`);
			continue;
		}

		const maxRam = ns.getServerMaxRam(host);
		const usedRam = ns.getServerUsedRam(host);

		const reserve = host === "home" ? reserveHomeRam : 0;
		const availRam = Math.max(0, maxRam - usedRam - reserve);

		let threadsCanRun = Math.floor(availRam / scriptRam);
		if (threadsCanRun <= 0) continue;

		threadsCanRun = Math.min(threadsCanRun, threadsRemaining);

		if (verbose) {
			ns.print(
				`Launching ${threadsCanRun} weaken threads on ${host} -> ${target}`,
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

		const args = build_script_args<WeakenArgs>({
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
			ns.print(`Failed to launch ${helperScript} on ${host}`);
			continue;
		}

		pendingJobs++;
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
