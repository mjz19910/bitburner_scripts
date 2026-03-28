import { HostInfoDB } from "@/HostInfoDB";
import { NS } from "@ns";

// api/all_hosts/httpworm.ts
export async function main(ns: NS) {
	const db = new HostInfoDB(ns);

	for (const info of db.data) {
		const srv = info.server;
		if (!srv) continue;
		if (!("openPortCount" in srv)) continue;
		if (srv.openPortCount === void 0) continue;
		if (srv.numOpenPortsRequired === void 0) continue;
		if (srv.numOpenPortsRequired < 4) continue;
		if (srv.httpPortOpen) continue;
		const { hostname: host } = srv;
		if (ns.httpworm(host)) {
			ns.tprint(
				"key update httpPortOpen ",
				host,
				" value ",
				true,
				" old ",
				srv.smtpPortOpen,
			);

			srv.httpPortOpen = true;

			const prev_opc = srv.openPortCount;
			srv.openPortCount += 1;

			ns.tprint(
				"key update openPortCount ",
				host,
				" value ",
				srv.openPortCount,
				" old ",
				prev_opc,
			);

			db.notify_changed();
		} else {
			ns.tprint("error httpworm for ", host);
		}
	}

	if (db.was_content_modified) {
		db.save();
	}
}
