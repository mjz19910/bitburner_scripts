import { HostsDatabase } from "types/HostsDatabase";

export async function main(ns: NS) {
	const db = new HostsDatabase(ns)
	for (const info of db.data.hosts) {
		if (info.server_info == null) {
			ns.tprint("need to run get-server first")
			break
		}
		const server = info.server_info
		if (server.hasAdminRights) continue
		if (server.openPortCount === void 0) continue
		if (server.numOpenPortsRequired === void 0) continue
		if (server.openPortCount < server.numOpenPortsRequired) continue
		if (ns.nuke(info.host)) {
			ns.tprint("nuke " + info.host)
			const prev = server.hasAdminRights
			ns.tprint("key update hasAdminRights ", info.host, " value ", true, " old ", prev)
			server.hasAdminRights = true
			db.notify_changed()
		} else {
			ns.tprint("nuke failed ", info.host)
		}
	}
	if (db.was_content_modified) {
		db.save()
	}
}