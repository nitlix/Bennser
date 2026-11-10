import createRiscvAsm from "../wasm/riscvasm.js";
import { type AssembleOptions, assembleWith } from "./assemble";

export type {
	AssembleError,
	AssembleOptions,
	AssembleResult,
} from "./assemble";

/** Assemble Manchester-dialect RISC-V source to KMD (upstream assembler, WASM). */
export const assemble = (source: string, opts?: AssembleOptions) =>
	assembleWith(createRiscvAsm, source, opts);
