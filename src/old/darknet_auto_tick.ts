/**
 * darknet_auto_tick.ts
 * Sends a trigger to the tick every mutation
 */
import { AUTO_TICK_PORT } from "./constants";

export async function main(ns: NS) {
	ns.disableLog("ALL");
	ns.tprint("[auto_tick] starting mutation-driven trigger");

	while (true) {
		ns.print("[auto_tick] waiting for next mutation...");
		await ns.dnet.nextMutation();

		ns.print("[auto_tick] mutation occurred, sending tick trigger");
		ns.tryWritePort(AUTO_TICK_PORT, JSON.stringify({
			source: "auto_tick",
			timestamp: Date.now()
		}));
	}
}
