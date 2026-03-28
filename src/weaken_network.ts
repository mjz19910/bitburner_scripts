import { resolveTarget } from "lib/last_target"
import { launchWeakenSomewhere } from "lib/launch_weaken"
import { WeakenReply, parseWeakenReply } from "helpers/weaken_args"
import { WorkerCommunication } from "lib/worker_communication"

/** weaken_network.ts
 * Uses all available rooted server RAM to weaken a target server.
 * Waits for weaken results through a port until enough security has been removed.
 */

export async function main(ns: NS) {
	let verbose_logging = false;
	const flags = ns.flags([
		["port", 1],
		["help", false],
		["v", false],
	]) as { port: number; help: boolean; v: boolean; _: [string] }

	if (flags.help) {
		ns.tprint("Usage: run weaken_network.js [<Server>] [--port N]")
		return
	}
	if (flags.v) verbose_logging = true;

	const target = resolveTarget(ns, flags._[0])
	if (target == null) return

	const portNum = flags.port

	const minSec = ns.getServerMinSecurityLevel(target)
	const curSec = ns.getServerSecurityLevel(target)
	const secDiff = curSec - minSec

	if (secDiff <= 0) {
		ns.tprint(`Skipping ${target}: already at min security (${curSec}/${minSec})`)
		return
	}

	// 1 weaken thread removes ~0.05 security
	const threadsNeeded = Math.ceil(secDiff / 0.05)

	ns.tprint(
		`Preparing to weaken ${target}: ` +
		`sec=${curSec.toFixed(2)} min=${minSec.toFixed(2)} diff=${secDiff.toFixed(2)} ` +
		`threads=${threadsNeeded}`
	)

	// clear old messages on this port
	ns.clearPort(portNum)

	const launch = launchWeakenSomewhere(ns, target, threadsNeeded, {
		helperScript: "tmp/weaken.ts",
		portNum,
		verbose: verbose_logging,
		reserveHomeRam: 0,
	})

	const launchedThreads = launch.launchedThreads
	const threadsRemaining = launch.threadsRemaining
	let pending = launch.pendingJobs

	if (launchedThreads <= 0) {
		ns.tprint(`ERROR: Could not launch any weaken threads for ${target}`)
		return
	}

	if (threadsRemaining > 0) {
		ns.tprint(`WARNING: Not enough RAM to fully weaken ${target}. Missing ${threadsRemaining} threads.`)
	}
	const expectedWeaken = launchedThreads * 0.05
	let totalWeaken = 0


	const weaken_com_port = new WorkerCommunication<WeakenReply>(
		ns,
		portNum,
		parseWeakenReply
	)

	ns.tprint(`Waiting for weaken results on port ${portNum}...`)

	while (pending > 0) {
		const msgs = weaken_com_port.read_from_worker()

		if (msgs.length === 0) {
			await weaken_com_port.port_handle.nextWrite()
			continue
		}

		for (const weakenMsg of msgs) {
			const { securityReduction } = weakenMsg;
			totalWeaken += securityReduction
			pending--

			if (!verbose_logging && pending % 20 === 0) {
				ns.tprint(`total_security_loss=${totalWeaken.toFixed(4)} / expected=${expectedWeaken.toFixed(4)}, pending=${pending}`)
			}
			if (verbose_logging) ns.tprint(
				`security_loss=${securityReduction.toFixed(4)} | ` +
				`total=${totalWeaken.toFixed(4)} / expected=${expectedWeaken.toFixed(4)} | ` +
				`pending=${pending}`
			)
		}
	}

	ns.tprint(
		`Done weakening ${target}: ` +
		`removed=${totalWeaken.toFixed(4)} ` +
		`finalSec=${ns.getServerSecurityLevel(target).toFixed(2)}`
	)
}

/** Autocomplete for server names */
export function autocomplete(data: AutocompleteData): string[] {
	return [...data.servers, "--port", "--help"]
}
