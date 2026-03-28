import { NS } from "@ns";
import { HostInfoDB } from "./HostInfoDB";
import { wv } from "./V";

export async function main(ns: NS) {
  const db = new HostInfoDB(ns);
  const info_arr = db.data.map((v) => ({
    hackTime: ns.getHackTime(v.server.hostname),
    data: v,
  }));
  info_arr.sort((a, b) => a.hackTime - b.hackTime);
  const arr1 = info_arr.filter((v) => v.data.server.hostname !== "home");
  const some = arr1.slice(0, 3);
  const some2 = some.map((v) => wv(v.data.server.hostname, v.hackTime));
  ns.tprint(JSON.stringify(some2, null, 2));
}
