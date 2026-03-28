import { isNormalServer } from "@/helpers";
import { HostInfoDB } from "@/HostInfoDB";
import { genConfig } from "@/layout";
import { AutocompleteData, NS, ScriptArg } from "@ns";

export async function main(ns: NS) {
	genConfig(ns).apply(99, 5, 2);
	const f = ns.flags([["runner", "home"], ["threads", 1]]) as {
		runner: string;
		threads: number;
		_: ScriptArg[];
	};
	if (f._[0] == void 0 || typeof f._[0] != "string") {
		return ns.tprint("no weaken target");
	}
	const target = f._[0];
	const runner = f.runner;
	const threads = f.threads;
	const db = new HostInfoDB(ns);
	const srv = db.find(target).server;
	if (srv === null) return ns.tprint("missing srv");
	if (!isNormalServer(srv)) return ns.tprint("srv is on the darknet");
	if (srv.hackDifficulty === void 0) {
		return ns.tprint("missing srv.hackDifficulty");
	}
	if (srv.hackDifficulty === srv.minDifficulty) {
		return ns.tprint("unable to weaken target");
	}
	while (true) {
		ns.tprint(`weaken ${target} on ${runner} (t=${threads})`);
		let result = await ns.weaken(target);
		ns.tprint(
			`weaken ${target} by ${Math.floor(result * 1000000) / 1000000}`,
		);
		if (result > 0) {
			srv.hackDifficulty -= result;
		}
		if (srv.hackDifficulty == srv.minDifficulty) break;
		if (result <= 0) break;
	}
	db.save();
	ns.writePort(1, {
		target,
		server: srv,
	});
	setTimeout(function () {
		const btn = globalThis["document"].querySelector(
			'.react-draggable:has([title^="api/loop/weaken."]) [title=Collapse]',
		)!;
		if (btn instanceof HTMLElement) {
			btn.click();
		}
	}, 2500);
}
export function autocomplete(data: AutocompleteData, args: ScriptArg[]) {
	if (args.length === 0) return data.servers;
	if (typeof args[0] != "string") return [];
	if (data.servers.includes(args[0])) return [];
	return data.servers;
}
