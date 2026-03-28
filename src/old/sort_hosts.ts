import { HostInfo, ServerProfile, HostsDatabase } from "types/HostsDatabase";
import { wv } from "types/V"

export async function main(ns: NS) {
  const db = new HostsDatabase(ns);
  const info_arr = db.data.hosts.filter((v): v is HostInfo & { profile: ServerProfile } => v.profile !== null);
  info_arr.sort((a, b) => a.profile.hack_time - b.profile.hack_time)
  const arr1 = info_arr.filter(v => v.host !== "home")
  const some = arr1.slice(0, 3)
  const some2 = some.map(v => wv(v.host, v.profile.hack_time))
  ns.tprint(JSON.stringify(some2, null, 2))
}
