import { comp15111 } from "./comp15111";
import { type Kmd, parseKmd } from "./kmd";
import { RV32, Size, Status, type StepTrace } from "./RV32";

export type StopReason =
	| "stopped" // ecall 5
	| "div-by-zero"
	| "breakpoint"
	| "ebreak"
	| "waiting-input" // ecall 1 with nothing left to read
	| "stalled" // unknown ecall selector: hangs forever on real Bennett
	| "step-limit";

export type RunResult = { reason: StopReason; steps: number };

export type MachineOptions = {
	onOutput?: (bytes: number[]) => void;
	onStep?: (trace: StepTrace) => void;
	/** Keep up to this many steps of undo history (0 = off). */
	history?: number;
};

/** CPU state not captured by StepTrace, snapshotted before each step. */
type Snapshot = {
	status: Status;
	instrCount: bigint;
	csrMinstret: number;
	csrInstret: number;
	csrInstreth: number;
	divisionByZero: boolean;
	ecallStall: boolean;
	outputLength: number;
};

export type HistoryEntry = { trace: StepTrace; before: Snapshot };

const CSR_MINSTRET = 0xb00;
const CSR_INSTRET = 0xc02;
const CSR_INSTRETH = 0xc82;

/** Friendly wrapper: load a program, feed input, run or step (and step back), collect output. */
export class Machine {
	readonly cpu = new RV32([comp15111]);
	kmd: Kmd | null = null;
	/** Every byte the program has printed (kept so undo can rewind it). */
	output: number[] = [];
	readonly history: HistoryEntry[] = [];
	private opts: MachineOptions;

	constructor(opts: MachineOptions = {}) {
		this.opts = opts;
		this.cpu.tracing = !!opts.onStep || !!opts.history;
	}

	loadKmd(text: string) {
		this.kmd = parseKmd(text);
		this.cpu.hardReset();

		for (const line of this.kmd.lines) {
			line.bytes.forEach((byte, i) =>
				this.cpu.memWrite(Size.Byte, line.address + i, byte),
			);
		}

		this.cpu.lastTrace = null;
		this.output = [];
		this.history.length = 0;
		return this.kmd;
	}

	input(text: string | Uint8Array) {
		const bytes =
			typeof text === "string" ? new TextEncoder().encode(text) : text;
		this.cpu.fifoIn.push(...bytes);
	}

	private snapshot(): Snapshot {
		const cpu = this.cpu;
		return {
			status: cpu.status,
			instrCount: cpu.instrCount,
			csrMinstret: cpu.csr[CSR_MINSTRET]!,
			csrInstret: cpu.csr[CSR_INSTRET]!,
			csrInstreth: cpu.csr[CSR_INSTRETH]!,
			divisionByZero: cpu.divisionByZero,
			ecallStall: cpu.ecallStall,
			outputLength: this.output.length,
		};
	}

	/** One delta + bookkeeping (output, trace callbacks, history). */
	private tick(): StepTrace | null {
		const cpu = this.cpu;
		const before = this.opts.history ? this.snapshot() : null;

		cpu.delta();

		if (cpu.fifoOut.length) {
			const bytes = cpu.fifoOut;
			cpu.fifoOut = [];
			this.output.push(...bytes);
			this.opts.onOutput?.(bytes);
		}

		const trace = cpu.lastTrace;
		cpu.lastTrace = null;
		if (!trace) return null;

		// A stalled ecall retried with nothing new is not a real step.
		const idleRetry = trace.ecallRetry && cpu.ecallStall;
		if (idleRetry) return null;

		this.opts.onStep?.(trace);
		if (!before) return trace;

		this.history.push({ trace, before });
		const max = this.opts.history!;
		if (this.history.length > max * 1.25)
			this.history.splice(0, this.history.length - max);
		return trace;
	}

	private stopReason(): StopReason | null {
		const cpu = this.cpu;

		if (cpu.ebreakStall) return "ebreak";
		if (cpu.ecallStall) {
			const a7 = cpu.registers[17];
			if (a7 === 1 && cpu.fifoIn.length === 0) return "waiting-input";
			if (a7 !== 0 && a7 !== 1) return "stalled";
		}
		if (cpu.running) return null;
		if (cpu.divisionByZero) return "div-by-zero";
		if (cpu.status === Status.StoppedBreakpoint) return "breakpoint";
		if (cpu.status === Status.StoppedHardwareReq) return "stopped";
		return null; // paused by the user / after a single step
	}

	/** Executes exactly one instruction (or one stalled-ecall retry). */
	step(): StopReason | null {
		const cpu = this.cpu;
		cpu.ebreakStall = false;
		if (!cpu.running && !cpu.ecallStall) cpu.signalStep = true;

		const trace = this.tick();

		// Upstream quirk: when stepping, delta() overwrites ecall 5's StoppedHardwareReq
		// with StoppedUserReq, so the program never "ends". Treat it as stopped here.
		const stoppedByEcall = trace?.ecall === 5 && !cpu.ecallStall;
		if (stoppedByEcall) cpu.status = Status.StoppedHardwareReq;

		return this.stopReason();
	}

	/**
	 * Run up to `maxSteps`. Pass `resume: false` when continuing a run in chunks:
	 * a breakpoint hit on the last step of the previous chunk then stops here
	 * instead of being overridden by the fresh run signal.
	 */
	run(
		maxSteps = 50_000_000,
		{ resume = true }: { resume?: boolean } = {},
	): RunResult {
		const cpu = this.cpu;
		if (!resume && cpu.trapped) {
			cpu.trapped = false;
			cpu.status = Status.StoppedBreakpoint;
			return { reason: "breakpoint", steps: 0 };
		}
		cpu.ebreakStall = false;
		cpu.signalRun = true;

		for (let steps = 0; steps < maxSteps; steps++) {
			this.tick();
			const reason = this.stopReason();
			if (reason) return { reason, steps: steps + 1 };
		}

		return { reason: "step-limit", steps: maxSteps };
	}

	/** Pause a run started with run(n) chunks, leaving the CPU in a steppable state. */
	pause() {
		if (this.cpu.running) this.cpu.status = Status.StoppedUserReq;
	}

	get canUndo() {
		return this.history.length > 0;
	}

	/** Rewind the most recent step. Returns the undone trace. */
	undo(): StepTrace | null {
		const entry = this.history.pop();
		if (!entry) return null;

		const { trace, before } = entry;
		const cpu = this.cpu;

		for (const w of [...trace.regWrites].reverse())
			cpu.registers[w.reg] = w.old;
		for (const m of [...trace.mem].reverse()) {
			if (m.kind === "write" && m.oldWord !== undefined)
				cpu.memory[m.address >>> 2] = m.oldWord;
		}
		for (const w of [...trace.csrWrites].reverse()) cpu.csr[w.csr] = w.old;
		if (trace.inputByte !== undefined) cpu.fifoIn.unshift(trace.inputByte);

		cpu.pc = trace.ecallRetry ? (trace.pc + 4) >>> 0 : trace.pc;
		cpu.status =
			cpu.running || before.status === Status.Running
				? Status.StoppedUserReq
				: before.status;
		cpu.instrCount = before.instrCount;
		cpu.csr[CSR_MINSTRET] = before.csrMinstret;
		cpu.csr[CSR_INSTRET] = before.csrInstret;
		cpu.csr[CSR_INSTRETH] = before.csrInstreth;
		cpu.divisionByZero = before.divisionByZero;
		cpu.ecallStall = before.ecallStall;
		cpu.ebreakStall = false;
		this.output.length = before.outputLength;

		return trace;
	}

	reg(n: number) {
		return this.cpu.registers[n]! | 0;
	}
}
