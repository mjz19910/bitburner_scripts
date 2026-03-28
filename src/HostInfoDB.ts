import { NS, Server } from "@ns";
import { DarknetServer } from "./helpers.js";

export const DB_FILE = "host_info.json";

export type HostInfo<T> = {
	children: string[];
	parent: string | null;
	depth: number;
	server: T;
};

type MyHostInfo = HostInfo<Server | DarknetServer>;

function isInfoForDarknetServer(
	x: HostInfo<Server | DarknetServer>,
): x is HostInfo<DarknetServer> {
	return "isOnline" in x.server;
}

function isInfoForServer(
	x: HostInfo<Server | DarknetServer>,
): x is HostInfo<Server> {
	return !isInfoForDarknetServer(x);
}

export class HostInfoDB {
	*iter_servers() {
		for (const info of this.data) {
			if (!isInfoForServer(info)) continue;
			yield info;
		}
	}
	*iter_darknet_servers() {
		for (const info of this.data) {
			if (!isInfoForDarknetServer(info)) continue;
			yield info;
		}
	}
	ns: NS;
	data: MyHostInfo[] = [];
	host_index = new Map<string, number>();
	was_content_modified = false;
	constructor(ns: NS) {
		this.ns = ns;
		this.load();
		this.save();
	}
	load() {
		const hosts_db_str = this.ns.read(DB_FILE);
		let data: Partial<MyHostInfo>[];
		if (hosts_db_str == "") {
			data = [];
		} else {
			data = JSON.parse(hosts_db_str);
		}
		for (let i = 0; i < data.length; i++) {
			const { children, parent, server, depth, ...r } = data[i];
			if (!server) continue;
			const info: MyHostInfo = {
				children: children ?? [],
				parent: parent ?? null,
				depth: depth ?? 0,
				server,
			};
			const idx = this.data.push(info) - 1;
			this.host_index.set(server.hostname, idx);
			if (Object.keys(r).length > 0) {
				this.ns.tprint("drop from server ", server.hostname, " ", r);
			}
		}
	}
	save() {
		const hosts_str = JSON.stringify(this.data);
		this.ns.write(DB_FILE, hosts_str, "w");
	}
	find(target: string) {
		const result = this.query(target);
		if (!result) throw new Error("unable to find target server info");
		return result;
	}
	query(target: string) {
		const idx = this.host_index.get(target);
		if (idx === void 0) return null;
		return this.data[idx];
	}
	push<T extends Server>(info: HostInfo<T>) {
		const idx = this.data.push(info) - 1;
		this.host_index.set(info.server.hostname, idx);
	}
	update_index() {
		this.host_index.clear();
		for (let i = 0; i < this.data.length; i++) {
			const entry = this.data[i];
			this.host_index.set(entry.server.hostname, i);
		}
	}
	notify_changed() {
		this.was_content_modified = true;
	}
	push_server<T extends Server>(server: T) {
		const info: HostInfo<T> = {
			children: [],
			parent: null,
			depth: 0,
			server,
		};
		this.push(info);
		return info;
	}
}
