/** grow2.ts
 * Grow a target server, posting growth factor to a port.
 * Flags:
 * --port <port>       Port number to post growth factor (default: 1)
 *
 * Positional args:
 * <runner>    (required)
 * <threads>   (required)
 * <server>    Server to grow (required)
 */

import { GrowArgs } from "./grow_args";
import { parse_script_args } from "./args";
import { AutocompleteData, NS } from "@ns";

export async function main(ns: NS) {
	const args = parse_script_args<GrowArgs>(ns, {
		port: 1,
		help: false,
	});
	if (args.help) return usage(ns);

	const runner = args._[0];
	const threads = args._[1];
	const target = args._[2];
	const portNum = args.port ?? 1;

	const growthFactor = await ns.grow(target);
	ns.writePort(portNum, {
		type: "grow",
		runner,
		threads,
		target,
		growthFactor,
	});
}

function usage(ns: NS, reason?: string) {
	if (reason) ns.tprint(reason);
	ns.tprint(
		"Usage: run tmp/grow.js <runner> <threads> <server> [--port <port>]",
	);
}

export function autocomplete(data: AutocompleteData): string[] {
	return [...data.servers, "--port", "--help"];
}
