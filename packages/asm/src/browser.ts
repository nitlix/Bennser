import createRiscvAsm from "../wasm/riscvasm.web.js";
import { type AssembleOptions, assembleWith } from "./assemble";

export type {
	AssembleError,
	AssembleOptions,
	AssembleResult,
} from "./assemble";

/** Browser build: no Node shims, safe for Next.js/Vite client bundles. */
export const assemble = (source: string, opts?: AssembleOptions) =>
	assembleWith(createRiscvAsm, source, opts);
