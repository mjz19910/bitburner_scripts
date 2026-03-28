import { read_string_arg } from "types/arg_parse"
import { HostInfo, HostsDatabase } from "types/HostsDatabase"

export async function main(ns: NS) {
  const state = new class {
    script_ram_target = -1
    find_weaken_target = false
    weaken_target_server: string | null = null
  };
  if (ns.args[0] === "--script-ram") {
    state.script_ram_target = ns.args[1] as number;
  } else if (ns.args[0] === "--next-weaken") {
    const args = ns.args.splice(0, 2)
    state.find_weaken_target = true;
    state.weaken_target_server = read_string_arg(args[1])
  } else {
    ns.tprint("no arguments choose option");
    ns.tprint("\t--script-ram [ram]");
    ns.tprint("\t--next-weaken # find next weaken target");
    return;
  }
  const db = new HostsDatabase(ns)
  const host_map: Record<string, Server> = {}
  for (const v of db.data.hosts) {
    if (v.server_info === null) continue
    host_map[v.host] = v.server_info
  }
  for (const info of db.data.hosts) {
    const host = info.host;
    const server = (info as HostInfo).server_info;
    if (!server) {
      ns.tprint("missing server info, run get-server");
      return;
    }
    if (state.script_ram_target !== -1) {
      if (!server.hasAdminRights) continue;
      if (host === "home") continue;
      const free_ram = server.maxRam - server.ramUsed;
      if (free_ram > state.script_ram_target) {
        const threads_to_fill_ram = Math.floor(free_ram / state.script_ram_target);
        ns.tprint("threads ", threads_to_fill_ram, " to fill ram of " + info.host);
      }
    }
    if (state.find_weaken_target && state.weaken_target_server) {
      if (!server.backdoorInstalled) continue;
      if (server.hackDifficulty != server.minDifficulty) {
        const exec_server = host_map[state.weaken_target_server];
        const free_ram = exec_server.maxRam;
        ns.tprint("weaken " + host + " by ", server.hackDifficulty! - server.minDifficulty!, " ", Math.floor(ns.getHackTime(host) / 1000));
        // (script: string, hostname: string, threadOrOptions?: number | RunOptions | undefined, ...args: ScriptArg[])
        ns.tprint(`run api/exec.ts api/loop/weaken.ts ${Math.floor(free_ram / 1.15)} ${host} -r ${state.weaken_target_server}`);
      }
    }
  }
}
