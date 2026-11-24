#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { assemble } from "@bennser/asm";
import {
	ABI_NAMES,
	Machine,
	type StepTrace,
	type StopReason,
	hex32,
} from "@bennser/core";
import { version } from "../package.json";

const HELP = `bennser — Manchester (Bennett) RISC-V assembler & emulator, anywhere

Usage:
  bennser run <file.s|file.kmd> [options]   assemble (if needed) and run
  bennser asm <file.s> [-o out.kmd]         assemble to KMD

Run options:
  -i, --input <text>     ecall input (default: stdin)
  -r, --regs             print registers when the program stops
  -t, --trace            print every instruction with register/memory changes
  -m, --max-steps <n>    step limit (default 50,000,000)
  -h, --help
  -v, --version

Exit codes: 0 stopped via ecall 5 · 1 assembly error · 2 abnormal stop`;

const color = process.stderr.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) =>
	color ? `\x1b[${code}m${s}\x1b[0m` : s;
const c = { dim: paint(2), red: paint(31), yellow: paint(33), cyan: paint(36) };

const REASONS: Record<StopReason, string> = {
	stopped: "stopped (ecall 5)",
	"div-by-zero": "halted: division by zero",
	breakpoint: "halted: breakpoint",
	ebreak: "halted: ebreak",
	"waiting-input": "halted: waiting for input but stdin is exhausted",
	stalled: "halted: unknown ecall (a7) — real Bennett would hang here",
	"step-limit": "halted: step limit reached (infinite loop?)",
};

const { values: flags, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		input: { type: "string", short: "i" },
		regs: { type: "boolean", short: "r" },
		trace: { type: "boolean", short: "t" },
		"max-steps": { type: "string", short: "m" },
		output: { type: "string", short: "o" },
		help: { type: "boolean", short: "h" },
		version: { type: "boolean", short: "v" },
	},
});

if (flags.version) {
	console.log(version);
	process.exit(0);
}

const [command, file] = positionals;

if (flags.help || !command || !file) {
	console.log(HELP);
	process.exit(flags.help ? 0 : 1);
}

/** Collect every file next to the source so `include` directives resolve. */
async function siblingFiles(path: string) {
	const { readdir } = await import("node:fs/promises");
	const dir = dirname(path);
	const files: Record<string, string> = {};

	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (!entry.isFile() || !/\.(s|asm|inc|h)$/i.test(entry.name)) continue;
		if (entry.name === basename(path)) continue;
		files[entry.name] = await readFile(join(dir, entry.name), "utf8");
	}
	return files;
}

async function toKmd(path: string) {
	if (extname(path).toLowerCase() === ".kmd") return readFile(path, "utf8");

	const result = await assemble(await readFile(path, "utf8"), {
		filename: basename(path),
		files: await siblingFiles(path),
	});

	if (result.ok) return result.kmd;

	for (const e of result.errors) {
		console.error(
			`${c.red("error")} ${relative(process.cwd(), path)}:${e.line}:${e.column + 1} ${e.message}`,
		);
		console.error(`  ${e.source}\n  ${" ".repeat(e.column)}${c.red("^")}`);
	}
	if (!result.errors.length) console.error(result.log);
	if (
		result.log.includes("Operator expected") &&
		/\d\s*\(\s*\w+\s*\)/.test(result.log)
	) {
		console.error(
			c.yellow(
				"hint: Bennett uses square brackets for addressing, e.g. lw a0, 4[a1]",
			),
		);
	}
	process.exit(1);
}

function printTrace(m: Machine, t: StepTrace) {
	const src = m.kmd?.sourceAt.get(t.pc)?.source.trim() ?? "";
	const changes = [
		...t.regWrites.map((w) => `${ABI_NAMES[w.reg]}=${hex32(w.value)}`),
		...t.mem
			.filter((a) => a.kind === "write")
			.map((a) => `[${hex32(a.address)}]=${hex32(a.value)}`),
		...(t.branchTaken !== undefined
			? [t.branchTaken ? "taken" : "not taken"]
			: []),
	];
	process.stderr.write(
		`${c.dim(hex32(t.pc))} ${c.dim(hex32(t.ir))}  ${src.padEnd(36)} ${c.cyan(changes.join(" "))}\n`,
	);
}

function printRegs(m: Machine) {
	const rows: string[] = [];
	for (let i = 0; i < 32; i += 4) {
		rows.push(
			[0, 1, 2, 3]
				.map(
					(j) =>
						`${`x${i + j}/${ABI_NAMES[i + j]}`.padStart(8)} ${hex32(m.reg(i + j))}`,
				)
				.join("  "),
		);
	}
	process.stderr.write(
		`${rows.join("\n")}\n${"pc".padStart(8)} ${hex32(m.cpu.pc)}\n`,
	);
}

async function run(path: string) {
	const kmd = await toKmd(path);
	const machine = new Machine({
		onOutput: (bytes) => process.stdout.write(Uint8Array.from(bytes)),
		onStep: flags.trace ? (t) => printTrace(machine, t) : undefined,
	});
	machine.loadKmd(kmd);

	const stdin =
		flags.input === undefined
			? process.stdin[Symbol.asyncIterator]()
			: null;
	if (flags.input !== undefined)
		machine.input(flags.input.replace(/\\n/g, "\n"));

	const maxSteps = Number(flags["max-steps"] ?? 50_000_000);
	let total = 0;
	let reason: StopReason;

	while (true) {
		const result = machine.run(maxSteps - total);
		total += result.steps;
		reason = result.reason;

		if (reason !== "waiting-input" || !stdin) break;
		const chunk = await stdin.next();
		if (chunk.done) break;
		machine.input(chunk.value as Uint8Array);
	}

	stdin?.return?.();

	const abnormal = reason !== "stopped";
	if (abnormal || flags.regs) {
		process.stderr.write(
			`\n${(abnormal ? c.yellow : c.dim)(`${REASONS[reason]} after ${total} steps`)}\n`,
		);
	}
	if (flags.regs) printRegs(machine);
	process.exit(abnormal ? 2 : 0);
}

async function asm(path: string) {
	const kmd = await toKmd(path);
	const out = flags.output ?? path.replace(/\.[^.]+$/, "") + ".kmd";
	await writeFile(out, kmd);
	console.log(`wrote ${out}`);
}

switch (command) {
	case "run":
		await run(file);
		break;
	case "asm":
		await asm(file);
		break;
	default:
		console.log(HELP);
		process.exit(1);
}
