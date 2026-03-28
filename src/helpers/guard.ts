export function isObject(obj: unknown): obj is Record<string, unknown> {
	return typeof obj === "object" && obj !== null
}

export function isMsgWithType<T extends string>(
	obj: unknown,
	type: T
): obj is { type: T } {
	return isObject(obj) && obj.type === type
}

export function hasNumberKeys<K extends string>(
	obj: unknown,
	...keys: K[]
): obj is Record<K, number> {
	if (!isObject(obj)) return false
	return keys.every((k) => typeof obj[k] === "number")
}

export function hasStringKeys<K extends string>(
	obj: unknown,
	...keys: K[]
): obj is Record<K, string> {
	if (!isObject(obj)) return false
	return keys.every((k) => typeof obj[k] === "string")
}