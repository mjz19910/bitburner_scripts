const selfScript = "darknet_find_all.ts"
export const deps = [selfScript]

export const static_known_passwords = [
	"admin",
	"password",
	"0000",
	"12345",
	"",
]

const registryFile = "/tmp/darknet_seen.txt"

export async function main(ns: NS) {
	if (!ns.fileExists("DarkscapeNavigator.exe", "home")) {
		ns.tprint(`Requires "DarkscapeNavigator.exe" on home`)
		return
	}

	const host = ns.getHostname()

	if (host === "home") {
		ns.tprint(`Bootstrapping darknet crawler on darkweb`)
		ns.scp(deps, "darkweb", "home")
		ns.exec(selfScript, "darkweb", 1)
		return
	}

	await crawlFromHere(ns)
}

async function crawlFromHere(ns: NS) {
	const host = ns.getHostname()

	if (alreadySeen(ns, host)) {
		ns.print(`Already processed ${host}`)
		return
	}
	markSeen(ns, host)

	ns.tprint(`[${host}] probing...`)

	const rawProbe = ns.dnet.probe()
	ns.tprint(`[${host}] probe raw = ${JSON.stringify(rawProbe)}`)

	const neighbors = extractTargets(rawProbe)
	ns.tprint(`[${host}] found ${neighbors.length} candidates`)

	for (const target of neighbors) {
		if (!target || target === host) continue

		if (alreadySeen(ns, target)) {
			ns.tprint(`[${host}] skipping already seen ${target}`)
			continue
		}

		const password = await tryAuthenticate(ns, target)
		if (password == null) {
			ns.tprint(`[${host}] auth failed for ${target}`)
			continue
		}

		const connected = await tryConnect(ns, target, password)
		if (!connected) {
			ns.tprint(`[${host}] connect failed for ${target}`)
			continue
		}

		const copied = copySelf(ns, target)
		if (!copied) {
			ns.tprint(`[${host}] scp failed to ${target}`)
			continue
		}

		const pid = ns.exec(selfScript, target, 1)
		if (pid === 0) {
			ns.tprint(`[${host}] exec failed on ${target}`)
			continue
		}

		ns.tprint(`[${host}] deployed crawler -> ${target}`)
	}
}

/**
 * Details about a server's authentication schema
 * @public
 */
interface ServerAuthDetails2 extends ServerAuthDetails {
	isOnline: boolean;
}

async function tryAuthenticate(ns: NS, target: string): Promise<string | null> {
	let authInfo: ServerAuthDetails2
	try {
		authInfo = ns.dnet.getServerAuthDetails(target)
		ns.tprint(`[${target}] authInfo: ${JSON.stringify(authInfo)}`)
	} catch (err) {
		ns.tprint(`[${target}] getServerAuthDetails() threw: ${String(err)}`)
	}

	for (const pw of static_known_passwords) {
		try {
			const result = await ns.dnet.authenticate(target, pw)
			ns.tprint(`authenticate(${target}, "${pw}") => ${JSON.stringify(result)}`)

			if (result.success) {
				ns.tprint(`Authenticated ${target} with "${pw}"`)
				return pw
			}
		} catch (err) {
			ns.tprint(`authenticate(${target}, "${pw}") threw: ${String(err)}`)
		}
	}
	return null
}

async function tryConnect(ns: NS, target: string, password: string) {
	try {
		const result = ns.dnet.connectToSession(target, password)
		ns.tprint(`connectToSession(${target}) => ${JSON.stringify(result)}`)

		return result.success
	} catch (err) {
		ns.tprint(`connectToSession(${target}, "${password}") threw: ${String(err)}`)

		try {
			const hb = await ns.dnet.heartbleed(target)
			ns.tprint(`heartbleed(${target}) => ${JSON.stringify(hb)}`)
		} catch { }

		return false
	}
}

function copySelf(ns: NS, target: string): boolean {
	try {
		return ns.scp(deps, target, ns.getHostname())
	} catch (err) {
		ns.print(`scp to ${target} threw: ${String(err)}`)
		return false
	}
}

function alreadySeen(ns: NS, target: string): boolean {
	if (!ns.fileExists(registryFile, "home")) return false
	const content = ns.read(registryFile)
	const set = new Set(
		String(content)
			.split("\n")
			.map(s => s.trim())
			.filter(Boolean)
	)
	return set.has(target)
}

function markSeen(ns: NS, target: string) {
	const existing = ns.fileExists(registryFile, "home")
		? String(ns.read(registryFile))
		: ""

	const set = new Set(
		existing
			.split("\n")
			.map(s => s.trim())
			.filter(Boolean)
	)

	if (!set.has(target)) {
		ns.write(registryFile, `${target}\n`, "a")
	}
}

function extractTargets(raw: unknown): string[] {
	if (!Array.isArray(raw)) return []

	return raw
		.map((entry): string | null => {
			if (typeof entry === "string") return entry

			if (entry && typeof entry === "object") {
				const obj = entry as Record<string, unknown>
				if (typeof obj.name === "string") return obj.name
				if (typeof obj.hostname === "string") return obj.hostname
				if (typeof obj.server === "string") return obj.server
				if (typeof obj.id === "string") return obj.id
			}

			return null
		})
		.filter((x): x is string => x !== null)
}
