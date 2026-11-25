import { hex32 } from "./registers";

/**
 * CSR names, mirrored from upstream Bennett.
 *
 * `CSRS` is `src/Modules/RISCV/csrlist` (address, access, name, description). The file writes
 * the hpm counter/event ranges as their first two and last entries (3, 4 … 31); those are
 * expanded here. Its `0x28X TBD` placeholder line is dropped.
 *
 * `BENNETT_CSRS` is `availableCSRS` from `csrlist.h`: the only CSRs Bennett's "CSR Registers"
 * bank shows (0x343 is called MTVAL there, `mbadaddr` in csrlist).
 *
 * The emulator gives none of these any meaning beyond storage, except: 0xB00 counts every
 * fetch (upstream bumps it at the top of `delta()`), 0xC02/0xC82 hold the 64-bit retired
 * count, and writes to 0xCxx–0xFxx (except 0x340) are ignored. See `RV32.csrWrite`.
 */

/** Access as written in csrlist: privilege (U/S/H/M/D) + RW or RO. */
export type CsrAccess = "URW" | "URO" | "SRW" | "HRW" | "MRW" | "MRO" | "DRW";

export type CsrInfo = {
	address: number;
	name: string;
	access: CsrAccess;
	description: string;
};

const csr = (
	address: number,
	access: CsrAccess,
	name: string,
	description: string,
): CsrInfo => ({ address, name, access, description });

/** n = 3 … 31, for the ranges csrlist abbreviates. */
const hpm = (fn: (n: number) => CsrInfo) =>
	Array.from({ length: 29 }, (_, i) => fn(i + 3));

export const CSRS: readonly CsrInfo[] = [
	csr(0x000, "URW", "ustatus", "User status register."),
	csr(0x004, "URW", "uie", "User interrupt-enable register."),
	csr(0x005, "URW", "utvec", "User trap handler base address."),
	csr(0x040, "URW", "uscratch", "Scratch register for user trap handlers."),
	csr(0x041, "URW", "uepc", "User exception program counter."),
	csr(0x042, "URW", "ucause", "User trap cause."),
	csr(0x043, "URW", "ubadaddr", "User bad address."),
	csr(0x044, "URW", "uip", "User interrupt pending."),
	csr(0x001, "URW", "fflags", "Floating-Point Accrued Exceptions."),
	csr(0x002, "URW", "frm", "Floating-Point Dynamic Rounding Mode."),
	csr(
		0x003,
		"URW",
		"fcsr",
		"Floating-Point Control and Status Register (frm + fflags).",
	),
	csr(0xc00, "URO", "cycle", "Cycle counter for RDCYCLE instruction."),
	csr(0xc01, "URO", "time", "Timer for RDTIME instruction."),
	csr(
		0xc02,
		"URO",
		"instret",
		"Instructions-retired counter for RDINSTRET instruction.",
	),
	...hpm((n) =>
		csr(
			0xc00 + n,
			"URO",
			`hpmcounter${n}`,
			"Performance-monitoring counter.",
		),
	),
	csr(0xc80, "URO", "cycleh", "Upper 32 bits of cycle, RV32I only."),
	csr(0xc81, "URO", "timeh", "Upper 32 bits of time, RV32I only."),
	csr(0xc82, "URO", "instreth", "Upper 32 bits of instret, RV32I only."),
	...hpm((n) =>
		csr(
			0xc80 + n,
			"URO",
			`hpmcounter${n}h`,
			`Upper 32 bits of hpmcounter${n}, RV32I only.`,
		),
	),
	csr(0x100, "SRW", "sstatus", "Supervisor status register."),
	csr(0x102, "SRW", "sedeleg", "Supervisor exception delegation register."),
	csr(0x103, "SRW", "sideleg", "Supervisor interrupt delegation register."),
	csr(0x104, "SRW", "sie", "Supervisor interrupt-enable register."),
	csr(0x105, "SRW", "stvec", "Supervisor trap handler base address."),
	csr(
		0x140,
		"SRW",
		"sscratch",
		"Scratch register for supervisor trap handlers.",
	),
	csr(0x141, "SRW", "sepc", "Supervisor exception program counter."),
	csr(0x142, "SRW", "scause", "Supervisor trap cause."),
	csr(0x143, "SRW", "sbadaddr", "Supervisor bad address."),
	csr(0x144, "SRW", "sip", "Supervisor interrupt pending."),
	csr(0x180, "SRW", "sptbr", "Page-table base register."),
	csr(0x200, "HRW", "hstatus", "Hypervisor status register."),
	csr(0x202, "HRW", "hedeleg", "Hypervisor exception delegation register."),
	csr(0x203, "HRW", "hideleg", "Hypervisor interrupt delegation register."),
	csr(0x204, "HRW", "hie", "Hypervisor interrupt-enable register."),
	csr(0x205, "HRW", "htvec", "Hypervisor trap handler base address."),
	csr(
		0x240,
		"HRW",
		"hscratch",
		"Scratch register for hypervisor trap handlers.",
	),
	csr(0x241, "HRW", "hepc", "Hypervisor exception program counter."),
	csr(0x242, "HRW", "hcause", "Hypervisor trap cause."),
	csr(0x243, "HRW", "hbadaddr", "Hypervisor bad address."),
	csr(0x244, "HRW", "hip", "Hypervisor interrupt pending."),
	csr(0xf11, "MRO", "mvendorid", "Vendor ID."),
	csr(0xf12, "MRO", "marchid", "Architecture ID."),
	csr(0xf13, "MRO", "mimpid", "Implementation ID."),
	csr(0xf14, "MRO", "mhartid", "Hardware thread ID."),
	csr(0x300, "MRW", "mstatus", "Machine status register."),
	csr(0x301, "MRW", "misa", "ISA and extensions"),
	csr(0x302, "MRW", "medeleg", "Machine exception delegation register."),
	csr(0x303, "MRW", "mideleg", "Machine interrupt delegation register."),
	csr(0x304, "MRW", "mie", "Machine interrupt-enable register."),
	csr(0x305, "MRW", "mtvec", "Machine trap-handler base address."),
	csr(
		0x340,
		"MRW",
		"mscratch",
		"Scratch register for machine trap handlers.",
	),
	csr(0x341, "MRW", "mepc", "Machine exception program counter."),
	csr(0x342, "MRW", "mcause", "Machine trap cause."),
	csr(0x343, "MRW", "mbadaddr", "Machine bad address."),
	csr(0x344, "MRW", "mip", "Machine interrupt pending."),
	csr(0x380, "MRW", "mbase", "Base register."),
	csr(0x381, "MRW", "mbound", "Bound register."),
	csr(0x382, "MRW", "mibase", "Instruction base register."),
	csr(0x383, "MRW", "mibound", "Instruction bound register."),
	csr(0x384, "MRW", "mdbase", "Data base register."),
	csr(0x385, "MRW", "mdbound", "Data bound register."),
	csr(0xb00, "MRW", "mcycle", "Machine cycle counter."),
	csr(0xb02, "MRW", "minstret", "Machine instructions-retired counter."),
	...hpm((n) =>
		csr(
			0xb00 + n,
			"MRW",
			`mhpmcounter${n}`,
			"Machine performance-monitoring counter.",
		),
	),
	csr(0xb80, "MRW", "mcycleh", "Upper 32 bits of mcycle, RV32I only."),
	csr(0xb82, "MRW", "minstreth", "Upper 32 bits of minstret, RV32I only."),
	...hpm((n) =>
		csr(
			0xb80 + n,
			"MRW",
			`mhpmcounter${n}h`,
			`Upper 32 bits of mhpmcounter${n}, RV32I only.`,
		),
	),
	csr(0x320, "MRW", "mucounteren", "User-mode counter enable."),
	csr(0x321, "MRW", "mscounteren", "Supervisor-mode counter enable."),
	csr(0x322, "MRW", "mhcounteren", "Hypervisor-mode counter enable."),
	...hpm((n) =>
		csr(
			0x320 + n,
			"MRW",
			`mhpmevent${n}`,
			"Machine performance-monitoring event selector.",
		),
	),
	csr(0x7a0, "MRW", "tselect", "Debug/Trace trigger register select."),
	csr(0x7a1, "MRW", "tdata1", "First Debug/Trace trigger data register."),
	csr(0x7a2, "MRW", "tdata2", "Second Debug/Trace trigger data register."),
	csr(0x7a3, "MRW", "tdata3", "Third Debug/Trace trigger data register."),
	csr(0x7b0, "DRW", "dcsr", "Debug control and status register."),
	csr(0x7b1, "DRW", "dpc", "Debug PC."),
];

/** csrlist entries by address. */
export const CSR_BY_ADDRESS: ReadonlyMap<number, CsrInfo> = new Map(
	CSRS.map((c) => [c.address, c]),
);

/** Bennett's "CSR Registers" bank (`availableCSRS` + `csrList` in csrlist.h), in its order. */
export const BENNETT_CSRS: ReadonlyMap<number, string> = new Map([
	[0x300, "MSTATUS"],
	[0x301, "MISA"],
	[0x304, "MIE"],
	[0x305, "MTVEC"],
	[0x340, "MSCRATCH"],
	[0x341, "MEPC"],
	[0x342, "MCAUSE"],
	[0x343, "MTVAL"],
	[0x344, "MIP"],
	[0xc00, "CYCLE"],
	[0xc01, "TIME"],
	[0xc02, "INSTRET"],
	[0xc80, "CYCLEH"],
	[0xc81, "TIMEH"],
	[0xc82, "INSTRETH"],
]);

/** Display name: Bennett's (lower-cased), else csrlist's, else the bare address. */
export const csrName = (address: number) =>
	BENNETT_CSRS.get(address)?.toLowerCase() ??
	CSR_BY_ADDRESS.get(address)?.name ??
	`0x${hex32(address).slice(-3)}`;
