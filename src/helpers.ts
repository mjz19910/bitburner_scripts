import { DarknetServerData, ScriptArg, Server } from "@ns";

export type Tag<T, U> = U & { _tag: T };

export function add_tag<T extends string, U>(_tag: T, value: U): Tag<T, U> {
	return value as Tag<T, U>;
}

export function omit_default<T>(value: T, defaultValue: T): T | undefined {
	return value === defaultValue ? undefined : value;
}

export function mergeSequencesInPlace(parts: string[][], minOverlap = 4) {
	for (let i = 0; i < parts.length; i++) {
		const current = parts[i];
		if (!current || current.length === 0) continue;

		for (let j = 0; j < i; j++) {
			const prev = parts[j];
			if (!prev || prev.length === 0) continue;

			const maxOverlap = Math.min(prev.length, current.length);
			let overlapLen = 0;

			// Find maximum overlap at end of prev vs start of current
			for (let len = maxOverlap; len >= minOverlap; len--) {
				let match = true;
				for (let k = 0; k < len; k++) {
					if (prev[prev.length - len + k] !== current[k]) {
						match = false;
						break;
					}
				}
				if (match) {
					overlapLen = len;
					break;
				}
			}

			if (overlapLen > 0) {
				// Merge in place: append non-overlapping part to prev
				prev.push(...current.slice(overlapLen));
				// Remove the current list from parts
				parts.splice(i, 1);
				i--; // adjust index because we removed an element
				break;
			}
		}
	}
}

type TypedRecord = {
	type: string;
};

export function hasTypeField<T extends TypedRecord>(x: unknown): x is T {
	return (
		typeof x === "object" &&
		x !== null &&
		"type" in x &&
		typeof x.type === "string"
	);
}

export type Optional<T> = { type: "some"; value: T } | { type: "empty" };

export function readValueAsMonad<T>(value: T | "NULL PORT DATA"): Optional<T> {
	if (value === "NULL PORT DATA") return empty_opt();
	return some_opt(value);
}

export function empty_opt(): { type: "empty" } {
	return { type: "empty" };
}

export function some_opt<T>(value: T): { type: "some"; value: T } {
	return { type: "some", value };
}

export function isNormalServer(
	s: Server | (DarknetServerData & { isOnline: boolean }),
): s is Server {
	return "moneyMax" in s;
}

export type Compute<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};
