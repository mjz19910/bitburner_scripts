/** tmp/hack.ts */
export async function main(ns: NS) {
	const target = ns.args[0]
	const threads = ns.args[1]
	if (typeof target !== "string") return
	if (typeof threads !== "number" || threads <= 0) return

	const start = Date.now()
	await ns.hack(target, { threads })
	const end = Date.now()

	const duration = end - start
	ns.tprint(`[hack] target=${target} threads=${threads} in ${ns.format.time(duration)}`)
}
