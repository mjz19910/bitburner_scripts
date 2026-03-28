import { NetscriptPort, NS, ScriptArg } from "@ns";

class PortEmptyError extends Error {
	constructor() {
		super(`Unexpected "NULL PORT DATA"`);
		this.name = "PortEmptyError";
	}
}

export class Com<T> {
	#ns: NS;
	#port: NetscriptPort;
	#port_id: number;

	constructor(ns: NS, port_id: number) {
		this.#ns = ns;
		this.#port = this.#ns.getPortHandle(port_id);
		this.#port_id = port_id;
	}

	getHandle() {
		return this.#port;
	}

	get port(): NetscriptPort {
		return this.#port;
	}

	get port_id() {
		return this.#port_id;
	}

	write(value: T) {
		return this.port.write(value);
	}

	tryWrite(value: T) {
		return this.port.tryWrite(value);
	}

	peek(): T {
		const data = this.port.peek();
		if (data === "NULL PORT DATA") throw new PortEmptyError();
		return data;
	}

	read(): T {
		const data = this.port.read();
		if (data === "NULL PORT DATA") throw new PortEmptyError();
		return data;
	}

	readOrUndefined(): T | undefined {
		const data = this.port.read();
		if (data === "NULL PORT DATA") return void 0;
		return data;
	}

	readAll(): T[] {
		const results: T[] = [];
		for (;;) {
			const data = this.port.read();
			if (data === "NULL PORT DATA") break;
			results.push(data);
		}
		return results;
	}

	nextWrite() {
		return this.port.nextWrite();
	}
	full() {
		return this.port.full();
	}
	empty() {
		return this.port.empty();
	}
	clear() {
		return this.port.clear();
	}
}

export interface IBatchInfo {
	server: string;
	target: string;
	batchId: number;
}

export interface IHGWReply extends IBatchInfo {
	type: HGWStr;
	data: number;
	time: number;
}

export interface IHGWRequest extends IBatchInfo {
	type: HGWStr;
	offset: number;
	port: number;
}

type HGWStr = "hack" | "grow" | "weaken";

interface BaseHgwReply extends IBatchInfo {
	data: number;
	server: string;
	target: string;
	batchId: number;
	time: number;
}

export class HGWReply<T extends HGWStr = HGWStr> {
	constructor(public type: T, public data: BaseHgwReply) {}

	static from_result<T extends HGWStr>(
		req: HGWRequest<T>,
		result: number,
	): HGWReply<T> {
		const { type, data } = req;
		return new HGWReply<T>(type, { ...data, data: result });
	}
}

type BaseHgwRequest = {
	server: string;
	target: string;
	offset: number;
	batchId: number;
	port: number;
	time: number;
};

export class HGWRequest<T extends HGWStr = "hack"> {
	constructor(public type: T, public data: BaseHgwRequest) {}

	static from_args<T extends HGWStr>(ns: NS): HGWRequest<T> | null {
		const args = ns.args;

		if (args.length < 6) {
			ns.tprint(`HGWRequest.from_args: requires 6 arguments`);
			return null;
		}

		const [type, server, target, offset, batchId, port] = args;

		if (type !== "hack" && type !== "grow" && type !== "weaken") {
			ns.tprint(`HGWRequest.from_args: invalid type `, type);
			return null;
		}

		if (typeof server !== "string") {
			ns.tprint(`HGWRequest.from_args: invalid server `, server);
			return null;
		}

		if (typeof target !== "string") {
			ns.tprint(`HGWRequest.from_args: invalid target `, target);
			return null;
		}

		if (typeof offset !== "number") {
			ns.tprint(`HGWRequest.from_args: invalid offset `, offset);
			return null;
		}

		if (typeof batchId !== "number") {
			ns.tprint(`HGWRequest.from_args: invalid batchId `, batchId);
			return null;
		}

		if (typeof port !== "number") {
			ns.tprint(`HGWRequest.from_args: invalid port `, port);
			return null;
		}

		return new HGWRequest<T>(type as T, {
			server,
			target,
			offset,
			batchId,
			port,
			time: Date.now(),
		});
	}

	to_args(): ScriptArg[] {
		return [
			this.type,
			this.data.server,
			this.data.target,
			this.data.offset,
			this.data.batchId,
			this.data.port,
		];
	}
}

export function logHWGWTable<T extends HGWStr>(
	ns: NS,
	req: HGWRequest<T>,
	result: number,
) {
	const cols = [
		req.type.toUpperCase().padEnd(6), // Action
		req.data.server.padEnd(10), // Runner / server
		req.data.target.padEnd(15), // Target
		req.data.offset.toString().padStart(5), // Offset ms
		req.data.batchId.toString(16).padStart(5), // Batch ID
		result.toString().padStart(8), // Result (money or hack amount)
	];

	ns.print(cols.join(" | "));
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
	];
	return cols.join(" | ");
}

type RunTaskCallback<T> = (a1: T) => Promise<number>;

export async function acceptArgs<T extends HGWStr>(
	ns: NS,
	req: HGWRequest<T> | null,
	run_task: RunTaskCallback<HGWRequest<T>["data"]>,
) {
	if (!req) return;
	const result = await run_task(req.data);
	const com = new Com(ns, req.data.port);
	com.write(HGWReply.from_result(req, result));
	logHWGWTable<T>(ns, req, result);
}
