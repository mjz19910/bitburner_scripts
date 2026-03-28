type JsonableClass = (new () => { toJSON: () => IReviverValue }) & {
	fromJSON: (value: IReviverValue) => unknown;
	validationData?: ObjectValidator<any>;
};

export interface IReviverValue<T = unknown> {
	ctor: string;
	data: T;
}

interface ParameterValidatorObject<Type, Key extends keyof Type> {
	default?: unknown;
	min?: number;
	max?: number;
	func?: (obj: Type, validator: ObjectValidator<Type>, key: Key) => void;
}
type ParameterValidatorFunction<Type, Key extends keyof Type> = (obj: Type, key: Key) => void;
type ParameterValidator<Type, Key extends keyof Type> =
	| ParameterValidatorObject<Type, Key>
	| ParameterValidatorFunction<Type, Key>;
type ObjectValidator<T> = {
	[key in keyof T]?: ParameterValidator<T, keyof T>;
};

function getFriendlyType(v: unknown): string {
	return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

export class TypeAssertionError extends Error {
	friendlyType: string;

	constructor(message: string, friendlyType: string, options?: ErrorOptions) {
		super(message, options);
		this.name = this.constructor.name;
		this.friendlyType = friendlyType;
	}
}

function assertObject(v: unknown): asserts v is Record<string, unknown> {
	const type = getFriendlyType(v);
	if (type !== "object") {
		console.error("The value is not an object. Value:", v);
		throw new TypeAssertionError(
			`The value is not an object. Its type is ${type}. Its string value is ${String(v)}.`,
			type,
		);
	}
}

/**
 * A generic "toJSON" function that creates the data expected by Reviver.
 *
 * @param ctorName String name of the constructor, part of the reviver JSON.
 * @param obj      The object to convert to stringified data in the reviver JSON.
 * @param keys     If provided, only these keys will be saved to the reviver JSON data. */
export function Generic_toJSON<T extends Record<string, any>>(
	ctorName: string,
	obj: T,
	keys?: readonly (keyof T)[],
): IReviverValue {
	const data = {} as T;
	// keys provided: only save data for the provided keys
	if (keys) {
		for (const key of keys) data[key] = obj[key];
		return { ctor: ctorName, data: data };
	}
	// no keys provided: save all own keys of the object
	for (const [key, val] of Object.entries(obj) as [keyof T, T[keyof T]][]) data[key] = val;
	return { ctor: ctorName, data: data };
}

/**
 * A generic "fromJSON" function for use with Reviver: Just calls the
 * constructor function with no arguments, then applies all of the
 * key/value pairs from the raw data to the instance. Only useful for
 * constructors that can be reasonably called without arguments!
 *
 * @param ctor The constructor to call
 * @param data The saved data to restore to the constructed object
 * @param keys If provided, only these keys will be restored from data.
 * @returns    The object */
export function Generic_fromJSON<T extends Record<string, any>>(
	ctor: new () => T,
	data: unknown,
	keys?: readonly (keyof T)[],
): T {
	assertObject(data);
	const obj = new ctor();
	// If keys were provided, just load the provided keys (if they are in the data)
	if (keys) {
		for (const key of keys) {
			// This cast is safe (T has string keys), but still needed because "keyof T" cannot be used to index data.
			const val = data[key as string];
			if (val !== undefined) {
				// This is an unsafe assignment. We may load data with wrong types at runtime.
				obj[key] = val as T[keyof T];
			}
		}
		return obj;
	}

	// No keys provided: load every key in data
	for (const [key, val] of Object.entries(data) as [keyof T, T[keyof T]][]) {
		// This is an unsafe assignment. We may load data with wrong types at runtime.
		obj[key] = val;
	}
	return obj;
}

export class PortEmptyError extends Error {
	constructor() {
		super(`Unexpected "NULL PORT DATA"`)
		this.name = "PortEmptyError"
	}
}

function isReviverValue(value: unknown): value is IReviverValue {
	return (
		typeof value === "object" && value !== null && "ctor" in value && typeof value.ctor === "string" && "data" in value
	);
}

export const constructorsForReviver: Partial<Record<string, JsonableClass>> = {};

export class Com {
	static register(revive: JsonableClass) {
		constructorsForReviver[revive.name] = revive
	}

	/** Smart reviver like the generic Reviver function */
	static revive<T>(value: unknown): T {
		// only objects with a ctor + data
		if (!isReviverValue(value)) return value as T

		const ctorEntry = constructorsForReviver[value.ctor]! as { fromJSON: (value: IReviverValue<T>) => T; }

		// Use fromJSON to revive
		return ctorEntry.fromJSON(value as IReviverValue<T>)
	}

	#ns: NS
	#port: NetscriptPort
	#port_id: number

	constructor(ns: NS, port_id: number) {
		this.#ns = ns;
		this.#port = this.#ns.getPortHandle(port_id)
		this.#port_id = port_id
	}

	getHandle() {
		return this.#port
	}

	get port(): NetscriptPort {
		return this.#port;
	}

	get port_id() {
		return this.#port_id
	}

	// -----------------------------
	// normalize object automatically
	// -----------------------------
	private normalize<T>(value: T): unknown {
		if (value && typeof value === "object" && "toJSON" in value) {
			return (value as any).toJSON()
		}
		return value
	}

	write<T>(value: T) {
		const normalized = this.normalize(value)
		return this.port.write(normalized)
	}

	tryWrite<T>(value: T) {
		const normalized = this.normalize(value)
		return this.port.tryWrite(normalized)
	}

	peek<T>(): T {
		const data = this.port.peek()
		if (data === "NULL PORT DATA") throw new PortEmptyError()
		return Com.revive<T>(data)
	}

	read<T>(): T {
		const data = this.port.read()
		if (data === "NULL PORT DATA") throw new PortEmptyError()
		return Com.revive<T>(data)
	}

	readOrUndefined<T>(): T | undefined {
		const data = this.port.read()
		if (data === "NULL PORT DATA") return void 0
		return Com.revive<T>(data)
	}

	readAll<T>(): T[] {
		const results: T[] = []
		for (; ;) {
			const data = this.port.read()
			if (data === "NULL PORT DATA") break
			results.push(Com.revive<T>(data))
		}
		return results
	}

	nextWrite() { return this.port.nextWrite() }
	full() { return this.port.full() }
	empty() { return this.port.empty() }
	clear() { return this.port.clear() }

	/** Parses JSON into a class instance using registered constructors */
	static parse_json<T>(json: string): T {
		const value = JSON.parse(json)
		if (!value || typeof value !== "object" || !("ctor" in value)) {
			throw new Error("Invalid reviver JSON")
		}
		const ctorEntry = constructorsForReviver[value.ctor]
		if (!ctorEntry) throw new Error(`Unknown ctor: ${value.ctor}`)
		return ctorEntry.fromJSON(value) as T
	}
}

export interface IBatchInfo {
	server: string
	target: string
	batchId: number
}

export interface IHGWReply extends IBatchInfo {
	type: HGWStr
	data: number
}

export interface IHGWRequest extends IBatchInfo {
	type: HGWStr
	offset: number
	port: number
}

type HGWStr = "hack" | "grow" | "weaken"

export class HGWReply implements IHGWReply {
	type: HGWStr = "hack"
	server: string = "unknown"
	target: string = "n00dles"
	batchId = 1
	data = 0
	time = Date.now()

	/** Serialize to JSON */
	toJSON(): IReviverValue {
		return Generic_toJSON("HGWReply", this)
	}

	/** Initialize from JSON */
	static fromJSON(value: IReviverValue): HGWReply {
		return Generic_fromJSON(this, value.data)
	}

	/** Build from request + result value */
	static from_result(req: HGWRequest, result: number): HGWReply {
		const ret = new HGWReply()
		ret.type = req.type
		ret.server = req.server
		ret.target = req.target
		ret.batchId = req.batchId
		ret.data = result
		return ret
	}

	static from_raw(raw: IHGWReply) {
		return Generic_fromJSON(this, raw)
	}

	raw(): IHGWReply {
		return {
			type: this.type,
			server: this.server,
			target: this.target,
			batchId: this.batchId,
			data: this.data,
		}
	}
}
constructorsForReviver.HGWReply = HGWReply

export class HGWRequest implements IHGWRequest {
	type: HGWStr = "hack"
	server: string = "unknown"
	target: string = "n00dles"
	offset: number = 0
	batchId: number = 1
	port: number = 1
	time = Date.now()

	/** Serialize to JSON */
	toJSON(): IReviverValue {
		return Generic_toJSON("HGWRequest", this)
	}

	/** Initialize from JSON */
	static fromJSON(value: IReviverValue): HGWRequest {
		return Generic_fromJSON(HGWRequest, value.data)
	}

	static from_raw(raw: IHGWRequest): HGWRequest {
		return Generic_fromJSON(this, raw)
	}

	raw(): IHGWRequest {
		return {
			type: this.type,
			server: this.server,
			target: this.target,
			batchId: this.batchId,
			offset: this.offset,
			port: this.port,
		}
	}

	getRunner() {
		return this.server
	}

	static from_args(args: ScriptArg[]): HGWRequest {
		const [type, server, target, offset, batchId, port] = args

		if (type !== "hack" && type !== "grow" && type !== "weaken") {
			throw new Error(`HGWRequest.from_args: invalid type ${String(type)}`)
		}

		if (typeof server !== "string") {
			throw new Error(`HGWRequest.from_args: invalid server ${String(server)}`)
		}

		if (typeof target !== "string") {
			throw new Error(`HGWRequest.from_args: invalid target ${String(target)}`)
		}

		if (typeof offset !== "number") {
			throw new Error(`HGWRequest.from_args: invalid offset ${String(offset)}`)
		}

		if (typeof batchId !== "number") {
			throw new Error(`HGWRequest.from_args: invalid batchId ${String(batchId)}`)
		}

		if (typeof port !== "number") {
			throw new Error(`HGWRequest.from_args: invalid port ${String(port)}`)
		}

		return HGWRequest.from_raw({
			type,
			server,
			target,
			offset,
			batchId,
			port,
		})
	}

	to_args(): ScriptArg[] {
		return [
			this.type,
			this.server,
			this.target,
			this.offset,
			this.batchId,
			this.port,
		]
	}
}
constructorsForReviver.HGWRequest = HGWRequest

export function logHWGWTable(ns: NS, req: HGWRequest, result: number) {
	const cols = [
		req.type.toUpperCase().padEnd(6),  // Action
		req.server.padEnd(10),               // Runner / server
		req.target.padEnd(15),               // Target
		req.offset.toString().padStart(5),   // Offset ms
		req.batchId.toString(16).padStart(5),   // Batch ID
		result.toString().padStart(8),   // Result (money or hack amount)
	]

	ns.print(cols.join(" | "))
}

export function logHWGWBatchStart(
	worker: string,
	batchId: number,
	target: string,
	pending: number,
) {
	const cols = [
		`[${worker}]`.padEnd(18 + 2),
		"0x" + `${batchId.toString(16)}`.padStart(4, "0"),
		`[${target}]`.padEnd(20 + 2),
		`${pending}`.padStart(2),
	]
	return cols.join(" | ")
}

type RunTaskCallback = () => Promise<number>;

export async function acceptArgs(ns: NS, req: HGWRequest, run_task: RunTaskCallback) {
	const result = await run_task()
	const com = new Com(ns, req.port)
	com.write(HGWReply.from_result(req, result))
	logHWGWTable(ns, req, result)
}
