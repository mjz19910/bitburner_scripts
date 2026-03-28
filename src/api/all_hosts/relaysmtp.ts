import { HostInfoDB } from "@/HostInfoDB";
import { NS } from "@ns";

// api/all_hosts/relaysmtp.ts
export async function main(ns: NS) {
	const db = new HostInfoDB(ns);

	for (const info of db.iter_servers()) {
		const srv = info.server;

		if (srv.openPortCount === void 0) continue;
		if (srv.numOpenPortsRequired === void 0) continue;
		if (srv.numOpenPortsRequired < 3) continue;
		if (srv.smtpPortOpen) continue;

		const host = srv.hostname;
		if (ns.relaysmtp(host)) {
			ns.tprint(
				"key update smtpPortOpen ",
				host,
				" value ",
				true,
				" old ",
				srv.smtpPortOpen,
			);

			srv.smtpPortOpen = true;

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
			ns.tprint("error relaysmtp for ", host);
		}
	}

	if (db.was_content_modified) {
		db.save();
	}
}
