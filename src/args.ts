import { NS, ScriptArg } from "@ns";

export type ArgsSpec<Seq, Opts> = { _: Seq } & Opts;
export type ArgsSpec2<Seq, Opts> = { _: Seq } & { [x: string]: Opts };

export function build_script_args<
	T extends { _: any[]; [x: string]: any },
>(
	args: T,
	defaultValues: { [x: string]: any },
): ScriptArg[] {
	for (const [key, value] of Object.entries(args)) {
		if (key === "_") continue;
		if (value === undefined) continue;
		if (value === false) continue;
		if (defaultValues[key] === value) continue;
		args._.push(`--${key}`);
		if (value !== true) args._.push(value);
	}
	return args._;
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
