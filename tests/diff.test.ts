/**
 * Differential tests: our TS core + WASM assembler vs. the upstream C++ (native).
 * Requires `bun run build:oracle` (and `bun run build:asm`).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { assemble } from "@bennser/asm";
import { Machine } from "@bennser/core";

const root = join(import.meta.dir, "..");
const native = join(root, "build-native");
const hasOracle =
	existsSync(join(native, "rvrun")) && existsSync(join(native, "riscvasm"));

type Outcome = { out: string; pc: number; x: number[] };

async function runOracle(
	kmd: string,
	input: string,
	maxSteps: number,
): Promise<Outcome> {
	const dir = join(native, "tmp");
	await Bun.write(join(dir, "p.kmd"), kmd);
	const proc = Bun.spawn(
		[join(native, "rvrun"), join(dir, "p.kmd"), String(maxSteps)],
		{
			stdin: new TextEncoder().encode(input),
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [out, err] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	await proc.exited;
	const j = JSON.parse(err.trim().split("\n").pop()!);
	return { out, pc: j.pc, x: j.x };
}

function runOurs(kmd: string, input: string, maxSteps: number): Outcome {
	let out = "";
	const m = new Machine({
		onOutput: (b) => (out += String.fromCharCode(...b)),
	});
	m.loadKmd(kmd);
	m.input(input);
	m.run(maxSteps);
	return { out, pc: m.cpu.pc, x: Array.from(m.cpu.registers) };
}

async function nativeKmd(source: string) {
	const dir = join(native, "tmp");
	await Bun.write(join(dir, "p.s"), source);
	await Bun.$`${join(native, "riscvasm")} ${join(dir, "p.s")} -lk ${join(dir, "native.kmd")}`
		.quiet()
		.nothrow();
	return Bun.file(join(dir, "native.kmd")).text();
}

async function compare(source: string, input = "", maxSteps = 200_000) {
	const result = await assemble(source);
	if (!result.ok)
		throw new Error(`assembly failed:\n${result.log}\n---\n${source}`);

	expect(result.kmd).toBe(await nativeKmd(source));
	const [theirs, ours] = [
		await runOracle(result.kmd, input, maxSteps),
		runOurs(result.kmd, input, maxSteps),
	];
	expect(ours).toEqual(theirs);
}

// ------------------------------------------------------------- random programs

const REGS = [
	"t0",
	"t1",
	"t2",
	"s0",
	"s1",
	"a0",
	"a1",
	"a2",
	"a3",
	"a4",
	"a5",
	"a6",
	"s2",
	"s3",
	"s4",
	"s5",
];
const R_OPS = [
	"add",
	"sub",
	"sll",
	"slt",
	"sltu",
	"xor",
	"srl",
	"sra",
	"or",
	"and",
	"mul",
	"mulh",
	"mulhsu",
	"mulhu",
	"div",
	"divu",
	"rem",
	"remu",
];
const I_OPS = ["addi", "slti", "sltiu", "xori", "ori", "andi"];
const SHIFT_OPS = ["slli", "srli", "srai"];
const LOADS = ["lb", "lh", "lw", "lbu", "lhu"];
const STORES = ["sb", "sh", "sw"];

function rng(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
}

function randomProgram(seed: number) {
	const r = rng(seed);
	const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
	const int = (lo: number, hi: number) =>
		lo + Math.floor(r() * (hi - lo + 1));
	const interesting = () =>
		pick([
			0,
			1,
			-1,
			2,
			31,
			32,
			0x7fffffff,
			-0x80000000,
			0x12345678,
			-8,
			int(-5000, 5000),
			int(-(2 ** 31), 2 ** 31 - 1),
		]);

	const lines = REGS.map((reg) => `        li ${reg}, ${interesting()}`);
	lines.push("        la gp, buf");

	for (let i = 0; i < 60; i++) {
		const kind = r();
		if (kind < 0.45) {
			lines.push(
				`        ${pick(R_OPS)} ${pick(REGS)}, ${pick(REGS)}, ${pick(REGS)}`,
			);
		} else if (kind < 0.65) {
			lines.push(
				`        ${pick(I_OPS)} ${pick(REGS)}, ${pick(REGS)}, ${int(-2048, 2047)}`,
			);
		} else if (kind < 0.78) {
			lines.push(
				`        ${pick(SHIFT_OPS)} ${pick(REGS)}, ${pick(REGS)}, ${int(0, 31)}`,
			);
		} else if (kind < 0.89) {
			lines.push(
				`        ${pick(STORES)} ${pick(REGS)}, ${int(0, 60)}[gp]`,
			);
		} else {
			lines.push(
				`        ${pick(LOADS)} ${pick(REGS)}, ${int(0, 60)}[gp]`,
			);
		}
	}

	lines.push("        li a7, 5", "        ecall", "buf     defs 64");
	return lines.join("\n") + "\n";
}

// ----------------------------------------------------------------------- tests

describe.skipIf(!hasOracle)("matches upstream Bennett", () => {
	const programs = join(import.meta.dir, "programs");

	for (const name of readdirSync(programs).filter((f) => f.endsWith(".s"))) {
		test(`program ${name}`, async () => {
			const source = await Bun.file(join(programs, name)).text();
			const inputFile = Bun.file(
				join(programs, name.replace(/\.s$/, ".in")),
			);
			await compare(
				source,
				(await inputFile.exists()) ? await inputFile.text() : "",
			);
		});
	}

	test("quirk corner cases", async () => {
		await compare(`
        li t0, -8
        srai s0, t0, 0
        srli s1, t0, 0
        li t1, 33
        sll s2, t1, t1
        li t2, -2147483648
        li t3, -1
        div s3, t2, t3
        rem s4, t2, t3
        mulhu s5, t3, t3
        mulhsu s6, t3, t3
        csrrwi s7, MSCRATCH, 31
        csrr s8, MSCRATCH
        la ra, back
        jalr ra, 0[ra]
back    li a7, 5
        ecall
`);
	});

	test("division by zero halts", async () => {
		await compare(
			"        li t0, 7\n        div a0, t0, zero\n        li a0, 99\n        li a7, 5\n        ecall\n",
		);
	});

	for (let seed = 1; seed <= 300; seed++) {
		test(`random program #${seed}`, async () => {
			await compare(randomProgram(seed));
		});
	}
});
