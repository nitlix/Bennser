/**
 * Pulls Bennett (and its riscv_tools submodule) into upstream/, records the exact
 * commits in upstream.lock.json, then rebuilds the WASM + native oracle and runs the tests.
 *
 *   bun run sync                     # latest Bennett, riscv_tools at Bennett's pinned commit
 *   bun run sync --ref <branch|sha>  # specific Bennett ref
 *   bun run sync --tools <ref>       # override riscv_tools (e.g. origin/main for unreleased fixes)
 *   bun run sync --locked            # reproduce exactly what upstream.lock.json says
 *   bun run sync --no-build          # fetch + lock only
 *
 * Needs access to gitlab.cs.man.ac.uk (campus network / VPN) and a git credential for it.
 */
import { $ } from "bun";
import { existsSync, renameSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

const root = join(import.meta.dir, "..");
const upstream = join(root, "upstream");
const toolsPath = "src/Libs/riscv_tools";
const tools = join(upstream, toolsPath);
const lockFile = join(root, "upstream.lock.json");
const BENNETT_URL = "https://gitlab.cs.man.ac.uk/cadtools/bennett.git";

type Pin = { url: string; commit: string; date: string };
type Lock = { bennett: Pin; riscv_tools: Pin };

const { values: args } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		ref: { type: "string" },
		tools: { type: "string" },
		locked: { type: "boolean", default: false },
		"no-build": { type: "boolean", default: false },
	},
});

const lock: Lock | null = existsSync(lockFile)
	? await Bun.file(lockFile).json()
	: null;

if (args.locked && !lock) {
	console.error("--locked: no upstream.lock.json yet");
	process.exit(1);
}

// An old plain copy (no .git) can't be pinned; keep it aside rather than deleting it.
if (existsSync(upstream) && !existsSync(join(upstream, ".git"))) {
	const aside = `${upstream}.old-${Date.now()}`;
	renameSync(upstream, aside);
	console.log(`moved untracked upstream/ to ${aside}`);
}

if (!existsSync(upstream)) {
	await $`git clone ${BENNETT_URL} ${upstream}`;
}

await $`git -C ${upstream} fetch --tags origin`;
const bennettRef = args.locked
	? lock!.bennett.commit
	: (args.ref ?? "origin/HEAD");
await $`git -C ${upstream} checkout --detach ${bennettRef}`;

await $`git -C ${upstream} submodule sync -- ${toolsPath}`;
await $`git -C ${upstream} submodule update --init -- ${toolsPath}`;

const toolsRef = args.locked ? lock!.riscv_tools.commit : args.tools;
if (toolsRef) {
	await $`git -C ${tools} fetch origin`;
	await $`git -C ${tools} checkout --detach ${toolsRef}`;
}

async function pin(dir: string): Promise<Pin> {
	const url = (await $`git -C ${dir} remote get-url origin`.text()).trim();
	const [commit, date] = (
		await $`git -C ${dir} log -1 --format=%H%n%cI`.text()
	)
		.trim()
		.split("\n");
	return { url, commit: commit!, date: date! };
}

const next: Lock = {
	bennett: await pin(upstream),
	riscv_tools: await pin(tools),
};
await Bun.write(lockFile, JSON.stringify(next, null, "\t") + "\n");

for (const key of ["bennett", "riscv_tools"] as const) {
	const before = lock?.[key].commit.slice(0, 10) ?? "none";
	const after = next[key].commit.slice(0, 10);
	console.log(
		`${key}: ${before} -> ${after}${before === after ? " (unchanged)" : ""}`,
	);
}

if (lock && lock.riscv_tools.commit !== next.riscv_tools.commit) {
	console.log(
		"\nriscv_tools changes (emulator/ changes need porting to packages/core by hand):",
	);
	await $`git -C ${tools} log --oneline ${lock.riscv_tools.commit}..${next.riscv_tools.commit} -- assembler emulator`.nothrow();
	await $`git -C ${tools} diff --stat ${lock.riscv_tools.commit} ${next.riscv_tools.commit} -- assembler emulator`.nothrow();
}

if (args["no-build"]) process.exit(0);

await $`bun ${join(root, "packages/asm/build.ts")}`;
await $`bun ${join(root, "tests/build-oracle.ts")}`;
await $`bun test ${join(root, "tests")}`;
