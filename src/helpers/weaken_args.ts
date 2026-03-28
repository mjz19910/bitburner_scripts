import { isMsgWithType, hasNumberKeys, hasStringKeys } from "helpers/guard.ts"
import { Tag } from "helpers"
import { ScriptArgSpec } from "helpers/args"

type WeakenSeqArgs = [
	runner: Tag<"runner", string>,
	threads: Tag<"threads", number>,
	target: Tag<"target", string>
]

type WeakenOptArgs = {
	port: number
	help: boolean
}

export type WeakenArgs = ScriptArgSpec<WeakenSeqArgs, WeakenOptArgs>

export type WeakenReply = {
	type: "weaken"
	runner: string;
	threads: number;
	target: string;
	securityReduction: number
}

export function parseWeakenReply(obj: unknown): WeakenReply | null {
	return isMsgWithType(obj, "weaken") &&
		hasStringKeys(obj, "runner", "target") &&
		hasNumberKeys(obj, "threads", "securityReduction")
		? obj
		: null
}
