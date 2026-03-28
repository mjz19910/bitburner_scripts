import { readValueAsMonad, Optional, some_opt } from "./helpers"

const NULL_PORT_DATA = "NULL PORT DATA" as const
type NullPortData = typeof NULL_PORT_DATA

export class PortEmptyError extends Error {
	constructor(portId: number) {
		super(`Port ${portId} is empty`)
		this.name = "PortEmptyError"
	}
}

export class PortFullError extends Error {
	constructor(portId: number) {
		super(`Port ${portId} is full`)
		this.name = "PortFullError"
	}
}

export class TypedNetScriptPort<T = unknown> {
	readonly ns: NS
	readonly #port_id: number
	readonly #port: NetscriptPort
	private logging = false

	constructor(ns: NS, port_id: number, port = ns.getPortHandle(port_id)) {
		this.ns = ns
		this.#port_id = port_id
		this.#port = port
	}

	get port_id() {
		return this.#port_id
	}

	config({ logging }: { logging: boolean }) {
		this.logging = logging
	}

	private log(user_msg: string, ...args: any[]) {
		if (!this.logging) return
		this.ns.tprint(`port(${this.#port_id}) ${user_msg}`, ...args)
	}

	private fromRaw<U>(value: U | NullPortData): U | undefined {
		return value === NULL_PORT_DATA ? undefined : value
	}

	peek(log_msg = "peek"): T {
		const data = this.#port.peek() as T | NullPortData
		this.log(`${log_msg} peek`, some_opt(data))
		if (data === NULL_PORT_DATA) throw new PortEmptyError(this.#port_id)
		return data
	}

	read(log_msg = "read"): T {
		const data = this.#port.read() as T | NullPortData
		this.log(`${log_msg} read`, some_opt(data))
		if (data === NULL_PORT_DATA) throw new PortEmptyError(this.#port_id)
		return data
	}

	tryRead(log_msg = "tryRead"): T | undefined {
		const data = this.#port.read() as T | NullPortData
		this.log(`${log_msg} read`, some_opt(data))
		return this.fromRaw(data)
	}

	readOpt(log_msg = "readOpt"): Optional<T> {
		const data = readValueAsMonad<T>(this.#port.read())
		this.log(`${log_msg} read`, some_opt(data))
		return data
	}

	readAll(log_msg = "readAll"): T[] {
		const results: T[] = []
		for (; ;) {
			const data = this.#port.read() as T | NullPortData
			if (data === NULL_PORT_DATA) break
			results.push(data)
		}
		this.log(`${log_msg} readAll`, results)
		return results
	}

	write(data: T, log_msg = "write"): void {
		if (this.#port.full()) throw new PortFullError(this.#port_id)
		const prev = this.#port.write(data) as T | NullPortData
		this.log(`${log_msg} write`, some_opt(data), "prev", some_opt(prev))
	}

	writePrev(data: T, log_msg = "writePrev"): T | undefined {
		const prev = this.#port.write(data) as T | NullPortData
		this.log(`${log_msg} write`, some_opt(data), "prev", some_opt(prev))
		return this.fromRaw(prev)
	}

	writePrevOpt(data: T, log_msg = "writePrevOpt"): Optional<T> {
		const prev = readValueAsMonad<T>(this.#port.write(data))
		this.log(`${log_msg} write`, some_opt(data), "prev", prev)
		return prev
	}

	tryWrite(data: T, log_msg = "tryWrite"): boolean {
		const success = this.#port.tryWrite(data)
		this.log(`${log_msg} tryWrite`, some_opt(data), success ? "success" : "failed")
		return success
	}

	nextWrite(log_msg = "nextWrite") {
		this.log(`${log_msg} nextWrite`)
		return this.#port.nextWrite()
	}

	full(log_msg = "full") {
		this.log(`${log_msg} full`)
		return this.#port.full()
	}

	empty(log_msg = "empty") {
		this.log(`${log_msg} empty`)
		return this.#port.empty()
	}

	clear(log_msg = "clear") {
		this.log(`${log_msg} clear`)
		this.#port.clear()
	}
}