/**
 * darknet_main.ts
 *
 * Entry point for darknet operations:
 * - Starts tail aggregator
 * - Starts orchestrator
 * - Starts initial worker(s)
 */

import { ORCHESTRATOR_SCRIPT, TAIL_SCRIPT, WORKER_SCRIPT } from "@/dnet_config";
import { NS } from "@ns";

export async function main(ns: NS) {
    ns.disableLog("ALL");
    const host = ns.getHostname();
    ns.tprint(`[darknet_main] starting darknet system on ${host}`);

    // 1. Start tail aggregator
    if (!ns.fileExists(TAIL_SCRIPT, host)) {
        ns.tprint(`[darknet_main] missing ${TAIL_SCRIPT}`);
        return;
    }
    const tailPid = ns.exec(TAIL_SCRIPT, host, 1);
    if (tailPid <= 0) {
        ns.tprint(`[darknet_main] failed to start tail aggregator`);
    } else {
        ns.tprint(`[darknet_main] tail aggregator started (pid=${tailPid})`);
    }

    await ns.sleep(200); // give tail time to start

    // 2. Start orchestrator
    if (!ns.fileExists(ORCHESTRATOR_SCRIPT, host)) {
        ns.tprint(`[darknet_main] missing ${ORCHESTRATOR_SCRIPT}`);
        return;
    }
    const orchPid = ns.exec(ORCHESTRATOR_SCRIPT, host, 1);
    if (orchPid <= 0) {
        ns.tprint(`[darknet_main] failed to start orchestrator`);
    } else {
        ns.tprint(`[darknet_main] orchestrator started (pid=${orchPid})`);
    }

    await ns.sleep(200); // give orchestrator time to initialize

    // 3. Start initial worker(s) on home ---
    if (!ns.fileExists(WORKER_SCRIPT, host)) {
        ns.tprint(`[darknet_main] missing ${WORKER_SCRIPT}`);
        return;
    }

    const initialWorkers = 1; // number of workers to start initially
    for (let i = 0; i < initialWorkers; i++) {
        const pid = ns.exec(WORKER_SCRIPT, "darkweb", 1);
        if (pid <= 0) {
            ns.tprint(`[darknet_main] failed to start worker #${i + 1}`);
        } else {
            ns.tprint(`[darknet_main] worker #${i + 1} started (pid=${pid})`);
        }
        await ns.sleep(100); // small delay between starting workers
    }

    ns.tprint(`[darknet_main] all scripts launched`);
}
