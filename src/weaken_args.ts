import { hasNumberKeys, hasStringKeys, isMsgWithType } from "./guard";
import { Tag } from "./helpers";

export type WeakenArgs = {
	_: [
		runner: Tag<"runner", string>,
		threads: Tag<"threads", number>,
		target: Tag<"target", string>,
	];
	port: number;
	help: boolean;
};

export type WeakenReply = {
	type: "weaken";
	runner: string;
	threads: number;
	target: string;
	securityReduction: number;
};

export function parseWeakenReply(obj: unknown): WeakenReply | null {
	return isMsgWithType(obj, "weaken") &&
			hasStringKeys(obj, "runner", "target") &&
			hasNumberKeys(obj, "threads", "securityReduction")
		? obj
		: null;
}
