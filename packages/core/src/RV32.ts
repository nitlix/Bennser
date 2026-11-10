/**
 * Bug-compatible TypeScript port of the Manchester RV32 core
 * (upstream/src/Libs/riscv_tools/emulator/RV32.cpp).
 *
 * Every deviation from the RISC-V spec here is deliberate: it mirrors what the
 * real Bennett emulator does. See NOTES.md → "Emulator quirks" before "fixing" anything.
 */

export const MEMORY_WORDS = 0x100000;
export const CSR_LENGTH = 0x1000;
export const REGISTER_COUNT = 32;

const ECALL = 0x00000073;
const EBREAK = 0x00100073;
const CSR_MINSTRET = 0xb00;
const CSR_INSTRET = 0xc02;
const CSR_INSTRETH = 0xc82;
const OUT_OF_RANGE = 0xdeadbeff;

export enum Status {
	Reset = 0,
	Busy = 1,
	BusyStepping = 2,
	StoppedBreakpoint = 0x40,
	StoppedWatchpoint = 0x42,
	StoppedProgrammeReq = 0x44,
	StoppedHardwareReq = 0x45,
	StoppedUserReq = 0x46,
	HandlingEcall = 0x47,
	Running = 0x80,
}

export enum Size {
	Byte,
	Half,
	Word,
}

export type MemAccess = {
	kind: "read" | "write";
	address: number;
	size: Size;
	value: number;
	/** For writes: the whole containing word before the write (for undo). */
	oldWord?: number;
};

/** Everything the visualiser needs to animate one instruction. */
export type StepTrace = {
	pc: number;
	ir: number;
	nextPc: number;
	regWrites: { reg: number; old: number; value: number }[];
	regReads: { reg: number; value: number }[];
	mem: MemAccess[];
	csrWrites: { csr: number; old: number; value: number }[];
	branchTaken?: boolean;
	ecall?: number;
	/** Byte consumed from the input FIFO by this step (ecall 1). */
	inputByte?: number;
	/** True when this step was a retry of a previously stalled ecall. */
	ecallRetry?: boolean;
};

const newTrace = (pc: number, ir: number): StepTrace => ({
	pc,
	ir,
	nextPc: pc,
	regWrites: [],
	regReads: [],
	mem: [],
	csrWrites: [],
});

export interface Handler {
	/** Return false to stall (the core retries on the next delta). */
	ecall(cpu: RV32): boolean;
}

export type Breakpoint = { address: number; active: boolean };

const imm12 = (ir: number) => (ir | 0) >> 20;

const immSt = (ir: number) => {
	const tmp = ((ir >>> 7) & 0x1f) | ((ir >>> 20) & 0xfe0);
	return ir & 0x80000000 ? tmp | 0xfffff800 : tmp & 0x7ff;
};

const immBr = (ir: number) => {
	const tmp =
		((ir >>> 7) & 0x1e) | ((ir >>> 20) & 0x7e0) | ((ir << 4) & 0x800);
	return ir & 0x80000000 ? tmp | 0xfffff000 : tmp;
};

const immJal = (ir: number) => {
	const tmp = ((ir >>> 20) & 0x7fe) | ((ir >>> 9) & 0x800) | (ir & 0xff000);
	return ir & 0x80000000 ? tmp | 0xfff00000 : tmp;
};

/** High 32 bits of a 64-bit product, computed with BigInt. */
const mulHigh = (a: bigint, b: bigint) =>
	Number(BigInt.asUintN(32, (a * b) >> 32n)) | 0;

export class RV32 {
	readonly memory = new Uint32Array(MEMORY_WORDS);
	readonly registers = new Uint32Array(REGISTER_COUNT);
	readonly csr = new Uint32Array(CSR_LENGTH);
	pc = 0;
	instrCount = 0n;
	status: Status = Status.StoppedHardwareReq;

	fifoIn: number[] = [];
	fifoOut: number[] = [];
	divisionByZero = false;

	signalReset = false;
	signalStop = false;
	signalStep = false;
	signalRun = false;
	ecallStall = false;
	ebreakStall = false;

	breakpoints: Breakpoint[] = [];
	handlers: Handler[];

	/** When true, every executed instruction fills `lastTrace`. */
	tracing = false;
	lastTrace: StepTrace | null = null;
	/** Set after an instruction lands on an active breakpoint; consumed by the next delta(). */
	trapped = false;

	constructor(handlers: Handler[]) {
		this.handlers = handlers;
		this.reset();
	}

	reset() {
		this.instrCount = 0n;
		this.csr[CSR_INSTRET] = 0;
		this.csr[CSR_INSTRETH] = 0;
		this.pc = 0;
		this.registers[0] = 0;
		this.ecallStall = false;
		this.clearSignals();
		this.fifoIn = [];
		this.fifoOut = [];
		this.divisionByZero = false;
	}

	/** Wipe memory and registers too (upstream reset() does not). */
	hardReset() {
		this.memory.fill(0);
		this.registers.fill(0);
		this.csr.fill(0);
		this.reset();
		this.status = Status.StoppedHardwareReq;
	}

	private clearSignals() {
		this.signalReset = false;
		this.signalRun = false;
		this.signalStep = false;
		this.signalStop = false;
	}

	private handleEcall() {
		return this.handlers.some((h) => h.ecall(this));
	}

	private handleSignals() {
		if (this.ecallStall && !this.signalReset) {
			if (this.tracing) {
				const pc = (this.pc - 4) >>> 0;
				this.lastTrace = {
					...newTrace(pc, ECALL),
					ecallRetry: true,
					ecall: this.registers[17],
				};
			}
			this.ecallStall = !this.handleEcall();
			if (this.lastTrace) this.lastTrace.nextPc = this.pc;
			return false;
		}

		if (this.trapped) this.status = Status.StoppedBreakpoint;
		if (this.signalStop) this.status = Status.StoppedUserReq;
		if (this.signalStep) this.status = Status.BusyStepping;
		if (this.signalRun) this.status = Status.Running;
		if (this.signalReset) {
			this.status = Status.Reset;
			this.reset();
		}

		this.clearSignals();
		return true;
	}

	/** One emulator tick, identical in semantics to riscv_t::delta(). */
	delta() {
		if (!this.handleSignals()) return;

		switch (this.status) {
			case Status.BusyStepping:
				this.nextInstruction();
				this.status = Status.StoppedUserReq;
				break;
			case Status.Running:
			case Status.HandlingEcall:
				this.nextInstruction();
				break;
		}

		this.trapped = this.breakpoints.some(
			(b) => b.active && b.address === this.pc,
		);
	}

	get running() {
		return (
			this.status === Status.Running ||
			this.status === Status.HandlingEcall ||
			this.status === Status.BusyStepping
		);
	}

	// ---------------------------------------------------------------- access

	regRead(n: number) {
		const reg = n & 0x1f;
		const value = this.registers[reg]!;
		this.lastTrace?.regReads.push({ reg, value });
		return value;
	}

	regWrite(n: number, value: number) {
		const reg = n & 0x1f;
		if (reg === 0) return;
		this.lastTrace?.regWrites.push({
			reg,
			old: this.registers[reg]!,
			value: value >>> 0,
		});
		this.registers[reg] = value;
	}

	/** Returns null when out of range (upstream yields 0xDEADBEFF + false). */
	memRead(address: number, size: Size): number | null {
		address >>>= 0;
		if (address >>> 2 >= MEMORY_WORDS) return null;

		const word = this.memory[address >>> 2]!;
		const shift = size === Size.Word ? 0 : (address % 4) * 8;
		const mask =
			size === Size.Byte
				? 0xff
				: size === Size.Half
					? 0xffff
					: 0xffffffff;
		const value = ((word >>> shift) & mask) >>> 0;

		this.lastTrace?.mem.push({ kind: "read", address, size, value });
		return value;
	}

	memReadOr(address: number, size: Size) {
		return this.memRead(address, size) ?? OUT_OF_RANGE;
	}

	memWrite(size: Size, address: number, data: number) {
		address >>>= 0;
		const base =
			size === Size.Byte
				? 0xff
				: size === Size.Half
					? 0xffff
					: 0xffffffff;
		const shift = 8 * (address & 3);
		const value = data << shift;
		const mask = base << shift;
		const index = address >>> 2;

		if (index >= MEMORY_WORDS) return false;

		this.lastTrace?.mem.push({
			kind: "write",
			address,
			size,
			value: data >>> 0,
			oldWord: this.memory[index]!,
		});
		this.memory[index] = (this.memory[index]! & ~mask) | (value & mask);
		return true;
	}

	csrRead(address: number) {
		return this.csr[address & 0xfff]!;
	}

	csrWrite(address: number, value: number) {
		const writable = (address & 0xc00) !== 0xc00 || address === 0x340;
		if (!writable) return;
		this.lastTrace?.csrWrites.push({
			csr: address,
			old: this.csr[address]!,
			value: value >>> 0,
		});
		this.csr[address] = value;
	}

	pcWrite(value: number) {
		this.pc = (value & ~3) >>> 0;
	}

	// ------------------------------------------------------------- execution

	private nextInstruction() {
		this.instrCount++;
		this.csr[CSR_MINSTRET] = this.csr[CSR_MINSTRET]! + 1;

		const pcL = this.pc;
		const fetched = this.memory[pcL >>> 2];
		const ir = pcL >>> 2 < MEMORY_WORDS ? fetched! : OUT_OF_RANGE;
		this.pc = (this.pc + 4) >>> 0;

		if (this.tracing) this.lastTrace = newTrace(pcL, ir);

		const completed = this.execute(ir, pcL);

		if (this.lastTrace) this.lastTrace.nextPc = this.pc;
		if (!completed) return;

		this.csr[CSR_INSTRET] = Number(this.instrCount & 0xffffffffn);
		this.csr[CSR_INSTRETH] = Number((this.instrCount >> 32n) & 0xffffffffn);
	}

	/** Returns false only for a stalled ecall (upstream returns early there). */
	private execute(ir: number, pcL: number): boolean {
		switch (ir & 0x7c) {
			case 0x00:
				this.load(ir);
				return true;
			case 0x10:
				this.intOp(ir, imm12(ir));
				return true;
			case 0x14:
				this.regWrite(ir >>> 7, ((ir & 0xfffff000) + pcL) | 0);
				return true;
			case 0x20:
				this.store(ir);
				return true;
			case 0x30:
				this.intOp(ir, this.regRead(ir >>> 20) | 0);
				return true;
			case 0x34:
				this.regWrite(ir >>> 7, ir & 0xfffff000);
				return true;
			case 0x60: {
				const taken = this.branchCond(ir);
				if (this.lastTrace) this.lastTrace.branchTaken = taken;
				if (taken) this.pc = (pcL + immBr(ir)) >>> 0;
				return true;
			}
			case 0x64:
				// Upstream writes rd *before* reading rs1: `jalr ra, 0[ra]` jumps to the new ra.
				this.regWrite(ir >>> 7, this.pc);
				this.pc = (this.regRead(ir >>> 15) + imm12(ir)) >>> 0;
				return true;
			case 0x6c:
				this.regWrite(ir >>> 7, this.pc);
				this.pc = (pcL + immJal(ir)) >>> 0;
				return true;
			case 0x70:
				return this.system(ir);
			default:
				// FP, atomics, custom, reserved, fence: silent NOP upstream.
				return true;
		}
	}

	private load(ir: number) {
		const address = (this.regRead(ir >>> 15) + imm12(ir)) >>> 0;
		let data = this.memReadOr(address, Size.Word);
		data = data >>> (8 * (address & 3));

		switch (ir & 0x7000) {
			case 0x0000:
				data = data & 0x80 ? data | 0xffffff00 : data & 0xff;
				break;
			case 0x1000:
				data = data & 0x8000 ? data | 0xffff0000 : data & 0xffff;
				break;
			case 0x4000:
				data &= 0xff;
				break;
			case 0x5000:
				data &= 0xffff;
				break;
		}

		this.regWrite(ir >>> 7, data);
	}

	private store(ir: number) {
		const address = (this.regRead(ir >>> 15) + immSt(ir)) >>> 0;
		const data = this.regRead(ir >>> 20);

		switch (ir & 0x7000) {
			case 0x0000:
				this.memWrite(Size.Byte, address, data);
				break;
			case 0x1000:
				this.memWrite(Size.Half, address, data);
				break;
			case 0x2000:
				this.memWrite(Size.Word, address, data);
				break;
		}
	}

	private branchCond(ir: number) {
		const a = this.regRead(ir >>> 15);
		const b = this.regRead(ir >>> 20);

		switch (ir & 0x7000) {
			case 0x0000:
				return a === b;
			case 0x1000:
				return a !== b;
			case 0x4000:
				return (a | 0) < (b | 0);
			case 0x5000:
				return !((a | 0) < (b | 0));
			case 0x6000:
				return a < b;
			case 0x7000:
				return !(a < b);
			default:
				return false;
		}
	}

	/**
	 * JS shift operators mask the count to 5 bits, which matches what the
	 * upstream C++ (technically UB) does on both x86-64 and AArch64.
	 */
	private intOp(ir: number, op2: number) {
		const rd = ir >>> 7;
		const rs1 = this.regRead(ir >>> 15) | 0;
		const rs2 = this.regRead(ir >>> 20) | 0;

		if ((ir & 0x02000020) === 0x02000020) {
			this.mulDiv(ir, rs1, rs2);
			return;
		}

		if ((ir & 0x20) === 0 && (ir & 0x3000) === 0x1000) op2 &= 0x1f;

		switch (ir & 0x7000) {
			case 0x0000:
				this.regWrite(
					rd,
					ir & 0x20 && ir & 0x40000000 ? rs1 - op2 : rs1 + op2,
				);
				return;
			case 0x1000:
				this.regWrite(rd, rs1 << op2);
				return;
			case 0x2000:
				this.regWrite(rd, rs1 < op2 ? 1 : 0);
				return;
			case 0x3000:
				this.regWrite(rd, rs1 >>> 0 < op2 >>> 0 ? 1 : 0);
				return;
			case 0x4000:
				this.regWrite(rd, rs1 ^ op2);
				return;
			case 0x5000: {
				// Quirk: shift by 0 of a negative value → mask is all ones.
				const mask = rs1 & 0x80000000 ? 0xffffffff << (32 - op2) : 0;
				const tmp = rs1 >>> op2;
				this.regWrite(rd, ir & 0x40000000 ? tmp | mask : tmp & ~mask);
				return;
			}
			case 0x6000:
				this.regWrite(rd, rs1 | op2);
				return;
			case 0x7000:
				this.regWrite(rd, rs1 & op2);
				return;
		}
	}

	private mulDiv(ir: number, rs1: number, rs2: number) {
		const rd = ir >>> 7;
		const op = ir & 0x7000;

		if (op >= 0x4000 && rs2 === 0) {
			this.status = Status.StoppedHardwareReq;
			this.divisionByZero = true;
			return;
		}

		switch (op) {
			case 0x0000:
				this.regWrite(rd, Math.imul(rs1, rs2));
				return;
			case 0x1000:
			case 0x2000:
			case 0x3000:
				// Upstream casts int32 → (unsigned) long long, sign-extending both
				// operands, so MULHSU and MULHU are identical to MULH.
				this.regWrite(rd, mulHigh(BigInt(rs1), BigInt(rs2)));
				return;
			case 0x4000:
				this.regWrite(rd, (rs1 / rs2) | 0);
				return;
			case 0x5000:
				this.regWrite(rd, Math.trunc((rs1 >>> 0) / (rs2 >>> 0)));
				return;
			case 0x6000:
				this.regWrite(rd, (rs1 % rs2) | 0);
				return;
			case 0x7000:
				this.regWrite(rd, (rs1 >>> 0) % (rs2 >>> 0));
				return;
		}
	}

	private system(ir: number): boolean {
		if (ir === ECALL) {
			if (this.lastTrace) this.lastTrace.ecall = this.registers[17];
			if (this.handleEcall()) return true;
			this.ecallStall = true;
			return false;
		}

		if (ir === EBREAK) {
			this.ebreakStall = true;
			return true;
		}

		if ((ir & 0x3000) === 0) return true;

		const csrAddr = (ir >>> 20) & 0xfff;
		// Quirk: immediate forms mask with 0xFFF, not 0x1F.
		const rs1 = ir & 0x4000 ? (ir >>> 15) & 0xfff : this.regRead(ir >>> 15);
		const rd = ir >>> 7;

		switch (ir & 0x3000) {
			case 0x1000: {
				// Quirk: tests bits 11–15 instead of rd (bits 7–11).
				const tmp = ir & 0xf800 ? this.csrRead(csrAddr) : 0;
				this.csrWrite(csrAddr, rs1);
				this.regWrite(rd, tmp);
				break;
			}
			case 0x2000: {
				const tmp = this.csrRead(csrAddr);
				if (rs1 !== 0) this.csrWrite(csrAddr, tmp | rs1);
				this.regWrite(rd, tmp);
				break;
			}
			case 0x3000: {
				const tmp = this.csrRead(csrAddr);
				if (rs1 !== 0) this.csrWrite(csrAddr, tmp & ~rs1);
				this.regWrite(rd, tmp);
				break;
			}
		}
		return true;
	}
}
