import { hasNumberKeys, hasStringKeys, isMsgWithType } from "./guard";
import { Tag } from "./helpers";

export type GrowArgs = {
	_: [
		runner: Tag<"runner", string>,
		threads: Tag<"threads", number>,
		target: Tag<"target", string>,
	];
	port: number;
	help: boolean;
};

export type GrowReply = {
	type: "grow";
	runner: string;
	threads: number;
	target: string;
	growthFactor: number;
};

export function parseGrowReply(obj: unknown): GrowReply | null {
	return isMsgWithType(obj, "grow") &&
			hasStringKeys(obj, "runner", "target") &&
			hasNumberKeys(obj, "threads", "growthFactor")
		? obj
		: null;
}
