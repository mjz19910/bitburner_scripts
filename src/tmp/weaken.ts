import { parse_script_args } from "helpers/args"
import { WeakenArgs } from "helpers/weaken_args"

/** tmp/weaken.ts
 * Weaken a target server, posting security reduction to a port.
 * Flags:
 * --port <port>       Port number to post weaken result (default: 1)
 *
 * Positional args:
 * <runner>            Server this script is running on
 * <threads>           Number of threads this script is assigned
 * <target>            Server to weaken (required)
 */

// Positional and optional args

export async function main(ns: NS) {
	const args = parse_script_args<WeakenArgs>(ns, {
		port: 1,
		help: false,
	})

	if (args.help) return usage(ns)

	const [runner, threads, target] = args._
	if (!target) return usage(ns, "must provide target")
	const portNum = args.port ?? 1

	// Perform the weaken
	const securityReduction = await ns.weaken(target)

	// Post result to port as structured message
	ns.writePort(portNum, {
		type: "weaken",
		runner,
		threads,
		target,
		securityReduction,
	})
}

function usage(ns: NS, reason?: string) {
	if (reason) ns.tprint(reason)
	ns.tprint("Usage: run tmp/weaken.js <runner> <threads> <server> [--port <port>]")
}

/** Autocomplete for convenience */
export function autocomplete(data: AutocompleteData): string[] {
	return [...data.servers, "--port", "--help"]
}
