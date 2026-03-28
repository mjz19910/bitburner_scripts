import { HostsDatabase } from "types/HostsDatabase"

export async function main(ns: NS) {
	const db = new HostsDatabase(ns)
	for (const info of db.data.hosts) {
		const srv = info.server_info
		if (!srv) {
			ns.tprint("skip brutessh for ", info.host, " no server_info")
			continue
		}
		if (srv.openPortCount === void 0) continue
		if (srv.numOpenPortsRequired === void 0) continue
		if (srv.numOpenPortsRequired < 1) continue
		if (srv.sshPortOpen) continue
		if (ns.brutessh(info.host)) {
			ns.tprint("key update sshPortOpen ", info.host, " value ", true, " old ", srv.sshPortOpen)
			srv.sshPortOpen = true
			const prev_opc = srv.openPortCount
			srv.openPortCount += 1
			ns.tprint("key update openPortCount ", info.host, " value ", srv.openPortCount, " old ", prev_opc)
			db.notify_changed()
		} else {
			ns.tprint("error brutessh for ", info.host)
		}
	}
	if (db.was_content_modified) {
		db.save()
	}
}