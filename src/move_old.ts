/** move_old_safe.ts
 * Move all files in the root of the host into old/
 * Does not overwrite existing files, appends _1, _2, etc. if needed
 */
export async function main(ns: NS) {
	const host = ns.getHostname();

	const files = ns.ls(host);

	for (const f of files) {
		if (f.endsWith(".exe")) continue
		if (f.endsWith(".msg")) continue
		if (f.endsWith(".lit")) continue
		if (!f.includes("/")) { // only root files
			let targetPath = `old/${f}`;
			let counter = 1;
			ns.tprint("will move ", f)

			// Avoid overwriting existing files
			while (ns.fileExists(targetPath, host)) {
				const dotIndex = f.lastIndexOf(".");
				if (dotIndex >= 0) {
					const name = f.substring(0, dotIndex);
					const ext = f.substring(dotIndex);
					targetPath = `old/${name}_${counter}${ext}`;
				} else {
					targetPath = `old/${f}_${counter}`;
				}
				counter++;
			}

			ns.mv(host, f, targetPath);
			ns.tprint(`Moved ${f} -> ${targetPath}`);
		}
	}

	ns.tprint("Finished moving all root files into old/ safely.");
}
