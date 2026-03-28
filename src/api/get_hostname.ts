import { TypedNetScriptPort } from "@/TypedNetScriptPort";
import { NS, ScriptArg } from "@ns";

export async function main(ns: NS) {
	const f = ns.flags([["port", 3]]) as {
		port: number;
		_: ScriptArg[];
	};
	const port = new TypedNetScriptPort<string>(ns, f.port);
	port.writePrevOpt(ns.getHostname(), "getHostname");
}
