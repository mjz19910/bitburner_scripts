import { HostsDatabase } from "types/HostsDatabase"
import { genConfig } from "config/layout"
export async function main(ns: NS) {
	const db = new HostsDatabase(ns)
	const f = ns.flags([["runner", "home"], ["target", "n00dles"], ["threads", 1]]) as {
		runner: string;
		target: string;
		threads: number;
		_: ScriptArg[];
	}
	const target = f.target
	const srv = db.find(target).server_info
	if (srv === null) return ns.tprint("missing srv")
	if (srv.moneyAvailable === void 0) return ns.tprint("missing moneyAvailable")
	if (srv.moneyMax === void 0) return ns.tprint("missing moneyAvailable")
	const real_hd = ns.getServerSecurityLevel()
	if (srv.hackDifficulty! != real_hd) {
		ns.tprint(`serverSecurityLevel mismatch ${real_hd} != ${srv.hackDifficulty}`)
		return
	}
	if (srv.moneyAvailable >= srv.moneyMax) {
		ns.tprint("unable to grow moneyAvailable on ", target)
		return
	}
	ns.ui.openTail()
	genConfig(ns).resize(40, 3)
	await ns.grow(f.target)
	const grow_gain = srv.hackDifficulty! - ns.getServerSecurityLevel()
	srv.hackDifficulty! += grow_gain
	ns.tprint("effect per thread ", grow_gain / f.threads)
}