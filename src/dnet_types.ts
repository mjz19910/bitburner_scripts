/**
 * dnet_types.ts
 *
 * Shared types for darknet orchestrator, planner, auth, execute, and worker
 */

export type ServerAuthDetails2 = {
	isOnline: boolean;
	isConnectedToCurrentServer: boolean;
	hasSession: boolean;
	modelId: string;
	passwordHint: string;
	data: string;
	logTrafficInterval: number;
	passwordLength: number;
	passwordFormat:
		| "numeric"
		| "alphabetic"
		| "alphanumeric"
		| "ASCII"
		| "unicode";
};
export type DarknetServerInfo = {
	type: "server_info";
	host: string;
	connectedToParent: boolean;
	authDetails: ServerAuthDetails2 | null;
	server: { hostname: string } | null;
	parent: string | null;
	key: string | null;
};
export const dnet_files = [
	"api/dnet/probe.ts",
	"api/dnet/stasis.ts",
	"src/dnet_types.ts",
	"api/dnet/probe_one.ts",
	"api/port_file_read.ts",
	"api/dnet/open_cache.ts",
	"api/dnet/update_probe.ts",
];

export type AuthInfo = {
	isOnline: boolean;
	isConnectedToCurrentServer: boolean;
	hasSession: boolean;
	modelId: string;
	passwordHint: string;
	passwordLength: number;
	passwordFormat: string;
	data: unknown;
};

export type EdgeReport = {
	source: string;
	target: string;
	authInfo: AuthInfo;
	password: string | null;
	timestamp: number;
};

export type EdgeReports = Record<string, Record<string, EdgeReport>>;

export type Topology = {
	edgeReports: EdgeReports;
	edges: Record<string, string[]>;
	reverseEdges: Record<string, string[]>;
	chainsFromHome: Record<string, string[]>;
	knownHosts: string[];
};

export type ExpansionCandidate = {
	target: string;
	bestSource: string;
	sourceChain: string[];
	deployableFromSource: boolean;
	needsRouteToSource: boolean;
	score: number;
	reason: string;
};

export type SeedReport = {
	source: string;
	target: string;
	authInfo: AuthInfo;
	timestamp: number;
};

export type AuthCandidate = {
	target: string;
	authPath: string[];
	requiresDirectAuth: boolean;
	reason: string;
};

export type WorkAssignment = {
	target: string; // Node we want to probe/expand
	sourceChain: string[]; // Hosts to hop through to reach source host
	taskId: number; // Unique ID for tracking
};
