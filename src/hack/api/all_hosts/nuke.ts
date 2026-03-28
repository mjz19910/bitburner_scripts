import { HostInfoDB } from "@/HostInfoDB";
import { NS } from "@ns";

export async function main(ns: NS) {
	const db = new HostInfoDB(ns);
	for (const info of db.data) {
		const server = info.server;
		if (server.hasAdminRights) continue;
		if (!("openPortCount" in server)) continue;
		if (server.openPortCount === void 0) continue;
		if (server.numOpenPortsRequired === void 0) continue;
		if (server.openPortCount < server.numOpenPortsRequired) continue;
		const host = server.hostname;
		if (ns.nuke(host)) {
			ns.tprint("nuke " + host);
			const prev = server.hasAdminRights;
			ns.tprint(
				"key update hasAdminRights ",
				host,
				" value ",
				true,
				" old ",
				prev,
			);
			server.hasAdminRights = true;
			db.notify_changed();
		} else {
			ns.tprint("nuke failed ", host);
		}
	}
	if (db.was_content_modified) {
		db.save();
	}
}
