import { hasNumberKeys, hasStringKeys, isMsgWithType } from "./guard";
import { Tag } from "./helpers";
import { ArgsSpec } from "./args";

export type GrowSeqArgs = [
	runner: Tag<"runner", string>,
	threads: Tag<"threads", number>,
	target: Tag<"target", string>,
];

export type GrowOptArgs = {
	port: number;
	help: boolean;
};

export type GrowArgs = ArgsSpec<GrowSeqArgs, GrowOptArgs>;

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
