/** scan.ts */
import { AutocompleteData, NS, Server } from "@ns";
import { DarknetServer } from "./type_helpers";
import { HostInfoDB } from "./HostInfoDB";

class ScanContext<T extends { hostname: string }> {
	queue: string[] = [];
	db: HostInfoDB;

	constructor(public ns: NS, public get_node_data: (target: string) => T) {
		this.db = new HostInfoDB(this.ns);
	}

	get_node(host: string) {
		const existing = this.db.query(host);
		if (existing) return existing;

		const server = this.get_node_data(host);
		return this.db.push_server(server);
	}

	relax(parent: string, child: string) {
		const parentInfo = this.get_node(parent);
		const childInfo = this.get_node(child);

		const newDepth = parentInfo.depth + 1;

		if (
			childInfo.parent === null ||
			newDepth < childInfo.depth
		) {
			childInfo.parent = parent;
			childInfo.depth = newDepth;
			this.queue.push(child);
		}
	}

	scan_target(target: string) {
		const info = this.get_node(target);
		const neighbors = this.ns.scan(target);

		info.children = neighbors;

		for (let i = 0; i < neighbors.length; i++) {
			this.relax(target, neighbors[i]);
		}
	}

	run(start: string) {
		this.queue.push(start);

		const root = this.get_node(start);
		root.parent = null;
		root.depth = 0;

		let head = 0;

		while (head < this.queue.length) {
			const current = this.queue[head++];

			// enforce home as root if found
			if (current === "home") {
				const home = this.get_node("home");
				if (home.depth !== 0 || home.parent !== null) {
					home.depth = 0;
					home.parent = null;
					this.queue.push("home"); // re-propagate
				}
			}

			this.scan_target(current);
		}

		// prune dead servers
		for (let i = this.db.data.length - 1; i >= 0; i--) {
			const info = this.db.data[i];
			if (!this.ns.serverExists(info.server.hostname)) {
				this.ns.tprint(
					"removing host entry for ",
					info.server.hostname,
				);
				this.db.data.splice(i, 1);
			}
		}

		this.db.update_index();
		this.db.save();
	}
}

function get_args_target_host(args: NS["args"]) {
	if (args.length === 0) return null;
	if (typeof args[0] !== "string") return null;
	return args[0];
}

export async function main(ns: NS) {
	const target = get_args_target_host(ns.args) ?? "home";
	new ScanContext<Server | DarknetServer>(ns, ns.getServer).run(target);
}

export function autocomplete(data: AutocompleteData) {
	return ["", ...data.servers];
}
