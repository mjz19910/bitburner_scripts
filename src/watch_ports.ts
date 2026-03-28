import { Com } from "com"

type PortWake<T> = {
	idx: number
	com: Com
	results: T[]
}

type PortWakeGen<T> = AsyncGenerator<PortWake<T>, void, void>

async function* watchPorts<T>(ns: NS, ports: Com[]): PortWakeGen<T> {
	let delay_time = 200
	const waits: Promise<PortWake<T>>[] = ports.map(read_port_wakes)

	for (; ;) {
		const first = await Promise.race(waits)
		const { com, idx, results } = first;
		yield first

		if (results.length < 8) delay_time *= 1.5
		if (results.length > 20) delay_time /= 2
		if (delay_time < 200) delay_time = 200

		await ns.sleep(delay_time)
		waits[idx] = read_port_wakes(com, idx)
	}

	async function read_port_wakes(com: Com, idx: number) {
		await com.nextWrite()
		const results = com.readAll<T>()
		return { idx, com, results }
	}
}

type WatchItem = {
	raw(): unknown
}

export async function main(ns: NS) {
	const ports: Com[] = []

	let portNumber = 1
	let emptyInRow = 0

	while (emptyInRow < 5) {
		const com = new Com(ns, portNumber)

		// drain backlog
		const msgs = com.readAll()
		if (msgs.length > 0) {
			for (const msg of msgs) ns.tprint(["startup msg", portNumber, msg])
			emptyInRow = 0
		} else {
			emptyInRow++
		}

		if (msgs.length > 0 || emptyInRow < 2) {
			ports.push(com)
		}

		portNumber++
	}

	for await (const { idx, results } of watchPorts<WatchItem>(ns, ports)) {
		for (const msg of results) {
			if ("raw" in msg && typeof msg.raw === "function") {
				ns.tprint(["msg", idx + 1, msg.raw()])
			} else {
				ns.tprint(["msg", idx + 1, msg])
			}
		}
	}
}