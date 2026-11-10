/**
 * Compiles the upstream Manchester RISC-V assembler (riscv_tools/assembler) to a
 * single-file ES module (wasm inlined), usable from Node, Bun and browsers.
 *
 *   bun packages/asm/build.ts
 */
import { $ } from "bun";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "../..");
const src = join(root, "upstream/src/Libs/riscv_tools/assembler");
const gen = join(import.meta.dir, "wasm/gen");
const targets = [
	{ out: join(import.meta.dir, "wasm/riscvasm.js"), env: "web,worker,node" },
	{ out: join(import.meta.dir, "wasm/riscvasm.web.js"), env: "web,worker" },
];

mkdirSync(gen, { recursive: true });

// Same regex as upstream generate_header.cmake (drops dotted mnemonics, on purpose).
const entries = readFileSync(join(src, "mnemonics"), "utf8")
	.split("\n")
	.map((line) => /^([A-Za-z0-9_]+)[ \t\r\n]+([A-F0-9]+)/.exec(line))
	.filter((m): m is RegExpExecArray => !!m)
	.map((m) => `{"${m[1]}", 0x${m[2]}},`);

writeFileSync(
	join(gen, "mnemonics.hpp"),
	`#include <cinttypes>\n#include <string>\n#include <unordered_map>\nstd::unordered_map<std::string, uint64_t> mnemonics {\n${entries.join("\n")}\n};`,
);

// Upstream's platform code has no working macOS/wasm path; mnemonics are embedded anyway.
writeFileSync(
	join(gen, "platform_stub.cpp"),
	`#include "rva_platform.hpp"\nstd::pair<std::filesystem::path, std::error_code> getexepath() { return {std::filesystem::path("/"), {}}; }\n`,
);

const baseArgs = [
	"-std=c++20",
	"-O2",
	"-DEMBEDDED_MNEMONICS",
	"-fexceptions",
	"-include",
	"bit", // upstream relies on <bit> arriving transitively (true on macOS libc++, not emscripten)
	`-I${gen}`,
	`-I${src}`,
	join(src, "main.cpp"),
	join(src, "rva.cpp"),
	join(gen, "platform_stub.cpp"),
	"-sMODULARIZE=1",
	"-sEXPORT_ES6=1",
	"-sEXPORT_NAME=createRiscvAsm",
	"-sSINGLE_FILE=1",
	"-sINVOKE_RUN=0",
	"-sEXIT_RUNTIME=1",
	"-sALLOW_MEMORY_GROWTH=1",
	"-sEXPORTED_RUNTIME_METHODS=callMain,FS",
];

for (const { out, env } of targets) {
	await $`em++ ${[...baseArgs, `-sENVIRONMENT=${env}`, "-o", out]}`;
	console.log(`built ${out}`);
}
