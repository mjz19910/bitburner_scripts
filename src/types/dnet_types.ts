export type ServerAuthDetails2 = {
	isOnline: boolean
	isConnectedToCurrentServer: boolean
	hasSession: boolean
	modelId: string
	passwordHint: string
	data: string
	logTrafficInterval: number
	passwordLength: number
	passwordFormat: "numeric" | "alphabetic" | "alphanumeric" | "ASCII" | "unicode"
}
export type DarknetServerInfo = {
	type: "server_info"
	host: string
	connectedToParent: boolean
	authDetails: ServerAuthDetails2 | null
	server: { hostname: string } | null
	parent: string | null
	key: string | null
}
export const dnet_files = [
	"api/dnet/probe.ts",
	"api/dnet/stasis.ts",
	"types/dnet_types.ts",
	"api/dnet/probe_one.ts",
	"api/port_file_read.ts",
	"api/dnet/open_cache.ts",
	"api/dnet/update_probe.ts",
]