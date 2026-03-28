type ScriptArgPrimitive = string | number | boolean

export type ScriptArgSpec<Seq, Opts> = {
	_: Seq
} & Partial<Opts>

export function build_script_args<T extends { _: readonly ScriptArg[] } & Record<string, ScriptArg | ScriptArg[]>>(
	args: T
): ScriptArg[] {
	const out: ScriptArg[] = []

	for (const arg of args._) {
		out.push(arg)
	}

	for (const [key, value] of Object.entries(args)) {
		if (key === "_") continue
		if (value === undefined) continue
		if (value === false) continue

		out.push(`--${key}`)
		if (value !== true) {
			out.push(value as ScriptArg)
		}
	}

	return out
}

export function omit_default<T>(value: T, defaultValue: T): T | undefined {
	return value === defaultValue ? undefined : value
}

export type SeqOf<T> = T extends ScriptArgSpec<infer Seq, any> ? Seq : never
export type OptsOf<T> = T extends ScriptArgSpec<any, infer Opts> ? Opts : never

/** Parse flags for a ScriptArgSpec<T>, now only needs 1 type parameter */
export function parse_script_args<T extends ScriptArgSpec<any, any>>(
	ns: NS,
	flagDefaults: Omit<OptsOf<T>, "_">
): T {
	// Convert flag defaults to ns.flags format
	const flagsInput = Object.entries(flagDefaults).map(([k, v]) => [k, v]) as [
		string,
		ScriptArgPrimitive
	][]

	const parsed = ns.flags(flagsInput)
	// Cast safely to the full ScriptArgSpec
	return parsed as unknown as T
}
