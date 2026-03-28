import { HostsDatabase } from "types/HostsDatabase"

// api/all_hosts/relaysmtp.ts
export async function main(ns: NS) {
	const db = new HostsDatabase(ns)

	for (const info of db.data.hosts) {
		if (!info.server_info) continue

		const srv = info.server_info

		if (srv.openPortCount === void 0) continue
		if (srv.numOpenPortsRequired === void 0) continue
		if (srv.numOpenPortsRequired < 4) continue
		if (srv.httpPortOpen) continue

		if (ns.httpworm(info.host)) {
			ns.tprint("key update httpPortOpen ", info.host, " value ", true, " old ", srv.smtpPortOpen)

			srv.httpPortOpen = true

			const prev_opc = srv.openPortCount
			srv.openPortCount += 1

			ns.tprint("key update openPortCount ", info.host, " value ", srv.openPortCount, " old ", prev_opc)

			db.notify_changed()
		} else {
			ns.tprint("error httpworm for ", info.host)
		}
	}

	if (db.was_content_modified) {
		db.save()
	}
}