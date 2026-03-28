import { NS, ScriptArg } from "@ns";

export type ArgsSpec<Seq, Opts> = { _: Seq } & Opts;
export type ArgsSpec2<Seq, Opts> = { _: Seq } & { [x: string]: Opts };

export function build_script_args<T extends ArgsSpec2<ScriptArg[], ScriptArg>>(
	args: T,
): ScriptArg[] {
	const out: ScriptArg[] = [];
	const { _: seq_args, ...args2 } = args;

	for (const arg of seq_args) {
		out.push(arg);
	}

	for (const [key, value] of Object.entries(args2)) {
		if (key === "_") continue;
		if (value === undefined) continue;
		if (value === false) continue;

		out.push(`--${key}`);
		if (value !== true) {
			out.push(value as ScriptArg);
		}
	}

	return out;
}

export function omit_default<T>(value: T, defaultValue: T): T | undefined {
	return value === defaultValue ? undefined : value;
}

export type SeqOf<T> = T extends ArgsSpec<infer Seq, any> ? Seq : never;
export type OptsOf<T> = T extends ArgsSpec<any, infer Opts> ? Opts : never;

/** Parse flags for a ScriptArgSpec<T>, now only needs 1 type parameter */
export function parse_script_args<T extends ArgsSpec<any, any>>(
	ns: NS,
	flagDefaults: Omit<OptsOf<T>, "_">,
): T {
	// Convert flag defaults to ns.flags format
	const flagsInput = Object.entries(flagDefaults).map(([k, v]) => [k, v]) as [
		string,
		ScriptArg,
	][];

	const parsed = ns.flags(flagsInput);
	return parsed as T;
}
