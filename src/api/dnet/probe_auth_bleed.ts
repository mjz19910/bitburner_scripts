import { DarknetServerInfo, DarknetServer, dnet_files } from "types/dnet_types"
const DNetFiles = {
	MemoryRealloc: "api/dnet/memory_realloc.ts"
} as const

class PortApi {
	static Read = "api/port_file_read.ts" as const
	static DnetOpenCache = "api/dnet/open_cache.ts" as const
	static DnetMemoryReallocation = "api/dnet/memory_realloc.ts" as const
	constructor(public ns: NS) { }
	remote_read(host: string, path: string, port: number = 1) {
		this.ns.exec(PortApi.Read, host, 1, host, path, port)
	}
	dnet_open_cache(host: string, path: string, port: number = 1) {
		this.ns.exec(PortApi.DnetOpenCache, host, 1, host, path, port)
	}
	dnet_memory_reallocation(host: string, threads: number, port = 1) {
		this.ns.exec(DNetFiles.MemoryRealloc, host, threads, host, threads, port)
	}
}

const ROMAN_NUMERAL_VALUES: Record<string, number> = {
	M: 1000,
	D: 500,
	C: 100,
	L: 50,
	X: 10,
	V: 5,
	I: 1
}

function decode_roman_num(ns: NS, val: string): number {

	if (val.length === 0) return 0
	if (val.length === 1) {
		const v = ROMAN_NUMERAL_VALUES[val[0]]
		if (v !== undefined) return v
		throw new Error(`Unable to decode Roman numeral (len=1) "${val}"`)
	}

	// Look at first two letters to handle subtraction cases
	const first = ROMAN_NUMERAL_VALUES[val[0]]
	const second = ROMAN_NUMERAL_VALUES[val[1]]
	if (first === undefined || second === undefined) {
		throw new Error(`Unknown Roman numeral char: "${val}"`)
	}

	if (first < second) {
		// Subtractive notation, e.g., IV = 4
		return second - first + decode_roman_num(ns, val.slice(2))
	} else {
		// Regular additive notation
		return first + decode_roman_num(ns, val.slice(1))
	}
}
/**
 * Simple recursive permutation generator
 */
function permute<T>(arr: T[]): T[][] {
	if (arr.length <= 1) return [arr]
	const result: T[][] = []

	for (let i = 0; i < arr.length; i++) {
		const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
		for (const p of permute(rest)) {
			result.push([arr[i], ...p])
		}
	}

	return result
}
type AuthFlowState = {
	runner: string;
	port: number;
	info: DarknetServerInfo;
};
const logging = false
function submit_auth_result(ns: NS, c: AuthFlowState, auth: DarknetResult, pw: string) {
	if (!auth.success) {
		if (logging) ns.tprint(
			"auth failed for ",
			JSON.stringify(c.info.host),
			" code=", auth.code, " ",
			JSON.stringify(auth.message),
		)
		return true
	}
	ns.tprint(`Authentication succeeded for ${c.info.host} with pw=${pw}`)
	c.info.key = pw
	ns.writePort(c.port, {
		type: "dnet_authenticate",
		by: c.runner,
		for: c.info.host,
		auth,
		key: pw,
	})
	return false
}
const ac_mgr_regexp = /The password is a number between (\d+) and (\d+)/;
export const dog_names = [
	"fido",
	"spot",
	"rover",
	"max",
]
type FactorsBleedResult = {
	code: number
	message: string
	data: `${boolean}`
	passwordAttempted: string
}
/** Solve a Factori-0s Darknet auth flow, using both valid factor sieve and invalid factor filtering */
async function Factori_0s(ns: NS, c: AuthFlowState) {
	const factors: number[] = []              // confirmed valid factors >= 100
	const invalidFactors: Set<number> = new Set() // numbers ruled out by data === "false"
	let cur_num = 2                          // start at 100 to satisfy min factor constraint

	ns.tprint(`Starting Factorios auth flow for ${c.info.host}`)

	for (; ;) {
		// Skip numbers that are invalid or less than 100
		while (invalidFactors.has(cur_num)) {
			cur_num++
		}

		// Compute remainders modulo known factors
		const fac_res = [1]
		for (const fac of factors) {
			if (fac === 1) continue
			fac_res.push(cur_num % fac)
		}
		ns.tprint(`factor_remainders = ${fac_res}`)

		const pw = cur_num.toString()
		ns.tprint(`authenticate(Factorios) for ${c.info.host} with "${pw}"`)

		const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
		ns.tprint("Factorios auth result:", auth)

		if (submit_auth_result(ns, c, auth, pw)) break

		ns.tprint(`heartbleed(Factorios) for ${c.info.host}`)
		const bleed_res = await ns.dnet.heartbleed(c.info.host)
		if (!bleed_res.success) {
			ns.tprint("heartbleed failed:", bleed_res)
			break
		}

		for (const log of bleed_res.logs) {
			let data: FactorsBleedResult | null = null
			try {
				data = JSON.parse(log) as FactorsBleedResult
			} catch {
				ns.tprint("heartbleed text_log ", log)
			}
			if (!data) continue
			if (data.code != 401) throw new Error("Invalid heartbleed(Factors) result code=" + data.code)
			ns.tprint(
				`Factorios bleed status:`, data,
				`pw=${data.passwordAttempted} num=${cur_num}`
			)

			const candidate = cur_num
			const { data: feedback_raw } = data
			const feedback = feedback_raw === "true"

			if (feedback) {
				if (factors.includes(candidate)) continue
				factors.push(candidate)
				ns.tprint(`New valid factor discovered: ${candidate}`)
			} else {
				invalidFactors.add(candidate)
				invalidFactors.add(candidate * 2)
				invalidFactors.add(candidate * 3)
				ns.tprint(`Number ruled out as factor: ${candidate}`)
			}
		}
	}
}

const AuthManager = {
	// hint="The password is shuffled 359"
	async Php(ns: NS, c: AuthFlowState) {
		const ad = c.info.authDetails
		if (!ad) return ns.tprint("No authDetails for ", c.info.host)
		const digits: string[] = ad.passwordHint.split("")
		ns.tprint("Trying all permutations of digits: ", digits.join(","))
		const calc_results: string[] = permute(digits).map(arr => arr.join(""))
		ns.tprint(`Generated ${calc_results.length} candidate passwords`)
		for (const pw of calc_results) {
			ns.tprint(`authenticate(PHP) for ${c.info.host} with "${pw}"`)
			const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
			if (submit_auth_result(ns, c, auth, pw)) break
		}
	},
	async FreshInstall(ns: NS, c: AuthFlowState) {
		const ad = c.info.authDetails!
		const valid_passwords = {
			"0000": "numeric" as const,
			"12345": "numeric" as const,
			"admin": "alphabetic" as const,
			"password": "alphabetic" as const,
		}
		const pw_tries = []
		for (const pw in valid_passwords) {
			const fmt = ad.passwordFormat
			if (valid_passwords[pw as keyof typeof valid_passwords] == fmt) {
				pw_tries.push(pw)
			}
		}
		for (const pw of pw_tries) {
			if (ad.passwordLength != pw.length) continue
			const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
			if (submit_auth_result(ns, c, auth, pw)) break
		}
	},
	async DeepGreen(ns: NS, c: AuthFlowState) {
		type DeepGreenBleedData = { code: 401; message: string; passwordAttempted: string }
		const chars = "0123456789".split("")
		const len = c.info.authDetails!.passwordLength
		const pw_arr = Array.from<string | null>({ length: len }).fill(null)
		for (const char of chars) {
			const pw = pw_arr.map(v => v === null ? char : v).join("")
			const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
			if (submit_auth_result(ns, c, auth, pw)) break
			const bleed_res = await ns.dnet.heartbleed(c.info.host)
			if (!bleed_res.success) {
				ns.tprint("heartbleed failed:", bleed_res)
				break
			}
			for (const log of bleed_res.logs) {
				let data: DeepGreenBleedData | null = null
				try {
					data = JSON.parse(log) as DeepGreenBleedData
				} catch {
					ns.tprint("heartbleed text_log ", log)
				}
				if (!data) continue
				if (data.code != 401) throw new Error("Invalid bleed result code=" + data.code)
				ns.tprint("heartbleed log ", data.message)
			}
		}
	},
	async CloudBlare(ns: NS, c: AuthFlowState) {
		let pw = ""
		for (const dig of c.info.authDetails!.data.matchAll(/\d+/g)) {
			pw += dig
		}
		const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
		submit_auth_result(ns, c, auth, pw)
	},
	async DeskMemo(ns: NS, c: AuthFlowState) {
		const pw = c.info.authDetails!.passwordHint.match(/\d+/)![0]
		const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
		submit_auth_result(ns, c, auth, pw)
	},
	// "The password is a number between 0 and 10"
	async AccountsManager(ns: NS, c: AuthFlowState) {
		type AccMgrBleedData = { code: 401; message: string; passwordAttempted: string; data: boolean } | {
			code: 200
		}
		const ad = c.info.authDetails!
		let match = ad.passwordHint.match(ac_mgr_regexp)
		if (!match) throw new Error("Invalid AccountsManager hint " + JSON.stringify(ad.passwordHint))
		const [, min_arg, max_arg] = match as [string, string, string]
		const min = +min_arg, max = +max_arg
		for (let i = min; i < max; i++) {
			const pw = "" + i;
			const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
			if (submit_auth_result(ns, c, auth, pw)) break
			const bleed_res = await ns.dnet.heartbleed(c.info.host)
			if (!bleed_res.success) {
				ns.tprint("heartbleed failed:", bleed_res)
				break
			}
			for (const log of bleed_res.logs) {
				let data: AccMgrBleedData | null = null
				try {
					data = JSON.parse(log) as AccMgrBleedData
				} catch {
					ns.tprint("heartbleed text_log ", log)
				}
				if (!data) continue
				if (data.code === 200) {
					ns.tprint("heartbleed(AccMgr,200) log ", data)
					continue
				}
				if (data.code != 401) {
					const err_code = (data as { code: number }).code
					throw new Error("Invalid heartbleed(AccMgr) result code=" + err_code)
				}
				ns.tprint("heartbleed log ", data.message)
			}
		}
	},
	async Nil(ns: NS, c: AuthFlowState) {
		type HeartbleedPasswordAttempt = { code: 401; message: string; passwordAttempted: string }
		const ad = c.info.authDetails!
		const chars = "0123456789".split("")
		const len = ad.passwordLength
		const pw_arr = Array.from<string | null>({ length: len }).fill(null)
		for (const char of chars) {
			const pw = pw_arr.map(v => v === null ? char : v).join("")
			const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
			if (submit_auth_result(ns, c, auth, pw)) break
			const bleed_res = await ns.dnet.heartbleed(c.info.host)
			if (!bleed_res.success) {
				ns.tprint("heartbleed failed:", bleed_res)
				break
			}
			for (const log of bleed_res.logs) {
				let data: HeartbleedPasswordAttempt | null = null
				try {
					data = JSON.parse(log) as HeartbleedPasswordAttempt
				} catch {
					ns.tprint("heartbleed text_log ", log)
				}
				if (!data) continue
				if (data.code != 401) throw new Error("Invalid heartbleed(Nil) result code=" + data.code)
				const p = data.message.split(",")
				for (let i = 0; i < p.length; i++) {
					if (p[i] === "yes") pw_arr[i] = char
				}
			}
		}
	},
	async BellaCuore(ns: NS, c: AuthFlowState) {
		const ad = c.info.authDetails!
		const num = decode_roman_num(ns, ad.data)
		if (num === null) throw new Error("unable to decode roman numeral " + ad.data)
		const pw = "" + num;
		const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, pw)
		submit_auth_result(ns, c, auth, pw)
	},
	async ProverFlo(ns: NS, c: AuthFlowState) {
		const ad = c.info.authDetails!
		ns.tprint(
			"new ProverFlo auth flow for ",
			JSON.stringify(c.info.host),
			" len=", ad.passwordLength
		)
		ns.tprint("  hint ", JSON.stringify(ad.passwordHint))
		ns.tprint("  data ", ad.data)
	},
	async OpenWeb(ns: NS, c: AuthFlowState) {
		const ad = c.info.authDetails!
		ns.tprint(
			"new OpenWeb auth flow for ",
			JSON.stringify(c.info.host),
			" len=", ad.passwordLength
		)
		ns.tprint("  hint ", JSON.stringify(ad.passwordHint))
		ns.tprint("  data ", ad.data)
	},
	async Laika4(ns: NS, c: AuthFlowState) {
		const ad = c.info.authDetails!
		ns.tprint(
			"new Laika4 auth flow for ",
			JSON.stringify(c.info.host),
			" len=", ad.passwordLength
		)
		ns.tprint("  hint ", JSON.stringify(ad.passwordHint))
		ns.tprint("  data ", JSON.stringify(ad.data))
	},
	async ZeroLogon(ns: NS, c: AuthFlowState) {
		const auth: DarknetResult = await ns.dnet.authenticate(c.info.host, "")
		submit_auth_result(ns, c, auth, "")
	}
}
function decode_model_id(id: string) {
	switch (id) {
		case "FreshInstall_1.0": return "FreshInstall"
		case "DeskMemo_3.1": return "DeskMemo"
		case "CloudBlare(tm)": return "CloudBlare"
		case "AccountsManager_4.2": return "AccountsManager"
		case "Pr0verFl0": return "ProverFlo"
		case "NIL": return "Nil"
		case "OpenWebAccessPoint": return "OpenWeb"
		case "PHP 5.4": return "Php"
		case "ZeroLogon":
		case "BellaCuore":
		case "DeepGreen":
		case "Laika4": return id
		default: return null
	}
}
function post_dnet_probe(ns: NS, infos: DarknetServerInfo[], idxs: Map<string, number>, runner: string, port: number) {
	for (const info of infos) {
		info.parent = null
		info.connectedToParent = false
	}
	const targets = ns.dnet.probe()
	for (const trg of targets) {
		const srv = ns.getServer(trg) as DarknetServer
		const ad = ns.dnet.getServerAuthDetails(trg)
		const info: DarknetServerInfo = {
			type: "server_info",
			parent: runner,
			host: trg,
			server: srv,
			authDetails: ad,
			key: null,
			connectedToParent: true,
		}
		if (idxs.has(trg)) {
			const i = idxs.get(trg)!
			const prev_info = infos[i]
			infos[i] = info
			if (prev_info.key !== null) {
				info.key = prev_info.key
			}
			continue
		}
		infos.push(info)
		idxs.set(trg, infos.length - 1)
	}
}

export async function main(ns: NS) {
	ns.ui.openTail()
	ns.disableLog("disableLog")
	ns.disableLog("rm")
	ns.disableLog("scp")
	ns.disableLog("exec")
	ns.disableLog("dnet.probe")
	ns.disableLog("dnet.heartbleed")
	ns.disableLog("dnet.authenticate")

	const infos: DarknetServerInfo[] = []
	const idxs = new Map<string, number>()

	const f = ns.flags([["runner", "home"], ["threads", 1], ["port", 1]]) as {
		runner: string;
		port: number;
		_: ScriptArg[];
	}
	if (f._.length === 1 && typeof f._[0] == "string") {
		f.runner = f._[0]
	}
	const runner = f.runner
	const port = f.port
	const local_probe = ns.dnet.probe()
	if (local_probe.length == 1 && local_probe[0] == "darkweb") {
		ns.scp(dnet_files, "darkweb", "home")
		const pid = ns.exec("api/dnet/probe.ts", "darkweb", 2, "--port", port, "--threads", 2, "--runner", "darkweb")
		ns.tprint("start probe pid=", pid)
		ns.ui.closeTail()
		return
	}
	const dnet_files_dyn: string[] = []
	for (const file of dnet_files) {
		if (dnet_files_dyn.includes(file)) continue
		dnet_files_dyn.push(file)
	}
	dnet_files_dyn.push(DNetFiles.MemoryRealloc)
	dnet_files_dyn.push(PortApi.Read)
	const dnet_port_api = new PortApi(ns);
	for (; ;) {
		post_dnet_probe(ns, infos, idxs, runner, port)
		ns.writePort(port, {
			type: "dnet_probe",
			by: runner,
			infos,
		})
		for (let i = 0; i < infos.length; i++) {
			let info = infos[i]
			const trg = info.host
			if (!info.connectedToParent) continue
			const ad = info.authDetails
			if (!ad) continue
			const c: AuthFlowState = { info, runner, port }
			switch (ad.modelId) {
				case "Factori-Os": await Factori_0s(ns, c); break
				default: {
					const handler_id = decode_model_id(ad.modelId)
					if (handler_id) {
						await AuthManager[handler_id](ns, { info, runner, port })
					} else {
						ns.tprint("no_handler=", { id: ad.modelId })
					}
				}
			}
			if (info.key === null) continue
			ns.scp(dnet_files_dyn, trg, "home")
			const unk_files = []
			const files = ns.ls(trg)
			for (const fileName of files) {
				if (fileName.endsWith(".ts")) continue
				if (fileName.endsWith(".cache")) {
					dnet_port_api.dnet_open_cache(trg, fileName)
					continue
				}
				if (fileName.endsWith(".data.txt")) {
					dnet_port_api.remote_read(trg, fileName)
					continue
				}
				unk_files.push(fileName)
			}
			if (!info.server) continue
			if (info.server.blockedRam > 0) {
				ns.tprint("blockedRam ", [info.server.ramUsed, info.server.blockedRam, info.server.maxRam])
				const ram_left = info.server.maxRam - info.server.ramUsed - info.server.blockedRam
				if (ram_left > 2.6) {
					const tc = Math.floor(ram_left / 2.6)
					dnet_port_api.dnet_memory_reallocation(trg, tc)
					info.server.ramUsed += tc * 2.6
				}
			}
		}
	}
}