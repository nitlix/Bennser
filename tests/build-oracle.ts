/**
 * Builds the native reference binaries from upstream sources:
 *   build-native/riscvasm  – upstream assembler
 *   build-native/rvrun     – upstream RV32 core wrapped by oracle/run.cpp
 */
import { $ } from "bun";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "..");
const tools = join(root, "upstream/src/Libs/riscv_tools");
const out = join(root, "build-native");
const asmGen = join(root, "packages/asm/wasm/gen");

mkdirSync(out, { recursive: true });

// Reuse the generated header/stub from the wasm build.
await $`bun ${join(root, "packages/asm/build.ts")}`.quiet().catch(() => {});
writeFileSync(join(out, ".gitkeep"), "");

await $`clang++ ${[
	"-std=c++20",
	"-O2",
	"-DEMBEDDED_MNEMONICS",
	`-I${asmGen}`,
	`-I${join(tools, "assembler")}`,
	join(tools, "assembler/main.cpp"),
	join(tools, "assembler/rva.cpp"),
	join(asmGen, "platform_stub.cpp"),
	"-o",
	join(out, "riscvasm"),
]}`;

await $`clang++ ${[
	"-std=c++20",
	"-O2",
	`-I${join(tools, "emulator")}`,
	join(root, "oracle/run.cpp"),
	join(tools, "emulator/RV32.cpp"),
	join(tools, "emulator/15111_handler.cpp"),
	"-o",
	join(out, "rvrun"),
]}`;

console.log("built build-native/riscvasm and build-native/rvrun");
