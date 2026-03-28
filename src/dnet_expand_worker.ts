import { NS } from "@ns";
import { AuthInfo } from "./dnet_types";
import { ORCHESTRATOR_PORT, PROBE_WORKER } from "./dnet_config";

export async function main(ns: NS) {
	const host = ns.getHostname();
	const targets = ns.args.map(String).filter(Boolean);

	if (targets.length === 0) {
		ns.tprint(
			`[${host}] usage: run darknet_expand_worker.ts <target1> [target2 ...]`,
		);
		return;
	}

	ns.tprint(`[${host}] expand worker starting for ${targets.join(", ")}`);

	for (const target of targets) {
		await expandOne(ns, host, target);
	}

	ns.tprint(`[${host}] expand worker finished`);
}

async function expandOne(ns: NS, source: string, target: string) {
	let authInfo = getAuth(ns, source, target);
	if (!authInfo) return;

	if (authInfo.isOnline === false) {
		ns.print(`[${source}] skip ${target}: offline`);
		return;
	}

	if (!authInfo.isConnectedToCurrentServer) {
		ns.print(`[${source}] skip ${target}: not directly connected`);
		return;
	}

	// already has a session
	if (authInfo.hasSession) {
		ns.print(`[${source}] ${target} already has session`);
		await deployProbe(ns, source, target, authInfo, null);
		return;
	}

	const candidates = buildPasswordCandidates(authInfo);
	let foundPassword: string | null = null;

	for (const pw of candidates) {
		try {
			const result = await ns.dnet.authenticate(target, pw);
			ns.print(
				`[${source}] authenticate(${target}, "${pw}") => ${
					JSON.stringify(result)
				}`,
			);

			if (isSuccessResult(result)) {
				foundPassword = pw;
				break;
			}
		} catch (err) {
			ns.print(
				`[${source}] authenticate(${target}, "${pw}") threw: ${
					String(err)
				}`,
			);
			await tryHeartbleed(ns, target);
		}
	}

	if (foundPassword == null) {
		ns.print(`[${source}] failed to authenticate ${target}`);
		report(ns, source, target, authInfo, null);
		return;
	}

	try {
		const conn = ns.dnet.connectToSession(target, foundPassword);
		ns.print(
			`[${source}] connectToSession(${target}) => ${
				JSON.stringify(conn)
			}`,
		);

		if (!isSuccessResult(conn)) {
			ns.print(`[${source}] connectToSession failed for ${target}`);
			report(ns, source, target, authInfo, foundPassword);
			return;
		}
	} catch (err) {
		ns.print(
			`[${source}] connectToSession(${target}) threw: ${String(err)}`,
		);
		return;
	}

	// IMPORTANT: re-check session state after connect
	authInfo = getAuth(ns, source, target);
	if (!authInfo) return;

	if (!authInfo.hasSession) {
		ns.print(`[${source}] session did not become active for ${target}`);
		report(ns, source, target, authInfo, foundPassword);
		return;
	}

	await deployProbe(ns, source, target, authInfo, foundPassword);
}

function getAuth(ns: NS, source: string, target: string): AuthInfo | null {
	try {
		const authInfo = ns.dnet.getServerAuthDetails(target) as AuthInfo;
		ns.print(`[${source}] ${target} auth=${JSON.stringify(authInfo)}`);
		return authInfo;
	} catch (err) {
		ns.print(
			`[${source}] getServerAuthDetails(${target}) failed: ${
				String(err)
			}`,
		);
		return null;
	}
}

async function deployProbe(
	ns: NS,
	source: string,
	target: string,
	authInfo: AuthInfo,
	password: string | null,
) {
	// One last sanity check before scp
	const latest = getAuth(ns, source, target);
	if (!latest?.hasSession) {
		ns.print(`[${source}] refusing to scp to ${target}: no active session`);
		report(ns, source, target, latest ?? authInfo, password);
		return;
	}

	const copied = ns.scp([PROBE_WORKER], target, source);
	if (!copied) {
		ns.print(`[${source}] failed to scp ${PROBE_WORKER} to ${target}`);
		report(ns, source, target, latest, password);
		return;
	}

	for (const proc of ns.ps(target)) {
		if (proc.filename === PROBE_WORKER) {
			ns.kill(proc.pid);
		}
	}

	const pid = ns.exec(PROBE_WORKER, target, 1);
	if (pid === 0) {
		ns.print(`[${source}] failed to exec ${PROBE_WORKER} on ${target}`);
		report(ns, source, target, latest, password);
		return;
	}

	report(ns, source, target, { ...latest, hasSession: true }, password);
	ns.print(`[${source}] deployed probe worker to ${target} pid=${pid}`);
}

function buildPasswordCandidates(authInfo: AuthInfo): string[] {
	const hint = typeof authInfo.passwordHint === "string"
		? authInfo.passwordHint.trim()
		: "";

	const out = new Set<string>();

	if (hint && hint !== "There is no password") {
		out.add(hint);
	}

	out.add("");

	if (authInfo.passwordFormat === "numeric") {
		out.add("0000".slice(0, authInfo.passwordLength));
		out.add("12345".slice(0, authInfo.passwordLength));
	}

	return [...out];
}

function report(
	ns: NS,
	source: string,
	target: string,
	authInfo: AuthInfo,
	password: string | null,
) {
	ns.tryWritePort(
		ORCHESTRATOR_PORT,
		JSON.stringify({
			source,
			target,
			authInfo,
			password,
			timestamp: Date.now(),
		}),
	);
}

function isSuccessResult(value: unknown): boolean {
	if (value == null) return false;
	if (typeof value === "boolean") return value;
	if (typeof value === "object" && "success" in value) {
		return !!(value as { success?: unknown }).success;
	}
	return false;
}

async function tryHeartbleed(ns: NS, target: string) {
	try {
		const hb = await ns.dnet.heartbleed(target);
		ns.print(
			`[${ns.getHostname()}] heartbleed(${target}) logs:\n${
				hb.logs.join("\n")
			}`,
		);
	} catch {}
}
