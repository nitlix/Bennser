/**
 * Bundles the CLI (core + WASM assembler inlined) into one dependency-free
 * file that runs on Node >= 18.3 and Bun.
 *
 *   bun packages/cli/build.ts
 */
import { chmodSync } from "fs";
import { join } from "path";

const out = join(import.meta.dir, "dist/bennser.js");

const result = await Bun.build({
	entrypoints: [join(import.meta.dir, "src/index.ts")],
	outdir: join(import.meta.dir, "dist"),
	naming: "bennser.js",
	target: "node",
	format: "esm",
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

chmodSync(out, 0o755);
console.log(`built ${out}`);
