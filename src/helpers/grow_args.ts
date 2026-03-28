import { isMsgWithType, hasNumberKeys, hasStringKeys } from "helpers/guard.ts"
import { Tag } from "helpers"
import { ScriptArgSpec } from "helpers/args"

export type GrowSeqArgs = [
	runner: Tag<"runner", string>,
	threads: Tag<"threads", number>,
	target: Tag<"target", string>
]

export type GrowOptArgs = {
	port: number
	help: boolean
}

export type GrowArgs = ScriptArgSpec<GrowSeqArgs, GrowOptArgs>

export type GrowReply = {
	type: "grow";
	runner: string;
	threads: number;
	target: string;
	growthFactor: number;
}

export function parseGrowReply(obj: unknown): GrowReply | null {
	return isMsgWithType(obj, "grow") &&
		hasStringKeys(obj, "runner", "target") &&
		hasNumberKeys(obj, "threads", "growthFactor")
		? obj
		: null
}
