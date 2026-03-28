export const LAST_TARGET_FILE = "db/last_target.txt"

export function resolveTarget(ns: NS, rawTarget: ScriptArg | undefined): string | null {
	if (rawTarget == void 0) {
		return ns.read(LAST_TARGET_FILE).trim()
	}
	let target = String(rawTarget ?? "").trim()

	if (target) {
		ns.write(LAST_TARGET_FILE, target, "w")
		return target
	}

	target = String(ns.read(LAST_TARGET_FILE) || "").trim()
	if (!target) {
		ns.tprint(`ERROR: No target supplied and no saved target in ${LAST_TARGET_FILE}`)
		return null
	}

	ns.tprint(`Using saved target: ${target}`)
	return target
}
