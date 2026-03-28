export class WorkerCommunication<T> {
	ns: NS;
	portNum: number
	port_handle: NetscriptPort
	validator: (x: unknown) => T | null;
	constructor(ns: NS, port_id: number, validator: (x: unknown) => T | null) {
		this.ns = ns
		this.portNum = port_id
		this.port_handle = ns.getPortHandle(port_id)
		this.validator = validator
	}
	send_to_parent(message: T) {
		this.port_handle.write(message)
	}

	read_from_worker(): T[] {
		let results: T[] = []
		for (; ;) {
			const rawMsg = this.port_handle.read()
			if (rawMsg === "NULL PORT DATA") {
				break
			}
			if (typeof rawMsg != "object") throw new Error("Invalid message " + JSON.stringify(rawMsg))
			if (rawMsg === null) throw new Error("Unable to read null from worker")
			const validMsg = this.validator.call(null, rawMsg)
			if (validMsg === null) {
				this.ns.print(`[port ${this.portNum}] skipped invalid message: `, rawMsg)
				continue
			}
			results.push(validMsg)
		}
		return results
	}
}
