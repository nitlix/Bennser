/**
 * Instruction decoder for display/visualisation only. Classifies by `ir & 0x7c`,
 * exactly like the emulator, so what you see is what actually executes.
 */
import { ABI_NAMES } from "./registers";

export type InstrClass =
	| "load"
	| "store"
	| "op-imm"
	| "op"
	| "muldiv"
	| "lui"
	| "auipc"
	| "branch"
	| "jal"
	| "jalr"
	| "ecall"
	| "ebreak"
	| "csr"
	| "nop";

export type Decoded = {
	cls: InstrClass;
	mnemonic: string;
	rd: number;
	rs1: number;
	rs2: number;
	imm: number;
	/** Which register-file ports are used. */
	usesRs1: boolean;
	usesRs2: boolean;
	writesRd: boolean;
	text: string;
};

const sx = (value: number, bits: number) =>
	(value << (32 - bits)) >> (32 - bits);

const LOADS = ["lb", "lh", "lw", "ld", "lbu", "lhu", "lwu", "l?"];
const STORES = ["sb", "sh", "sw", "s?", "s?", "s?", "s?", "s?"];
const BRANCHES = ["beq", "bne", "b?", "b?", "blt", "bge", "bltu", "bgeu"];
const OPS = ["add", "sll", "slt", "sltu", "xor", "srl", "or", "and"];
const MULDIV = ["mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu"];
const CSRS = ["", "csrrw", "csrrs", "csrrc", "", "csrrwi", "csrrsi", "csrrci"];

const reg = (n: number) => ABI_NAMES[n]!;

export function decode(ir: number): Decoded {
	const rd = (ir >>> 7) & 31;
	const rs1 = (ir >>> 15) & 31;
	const rs2 = (ir >>> 20) & 31;
	const f3 = (ir >>> 12) & 7;
	const base = {
		rd,
		rs1,
		rs2,
		imm: 0,
		usesRs1: false,
		usesRs2: false,
		writesRd: false,
	};

	switch (ir & 0x7c) {
		case 0x00: {
			const imm = ir >> 20;
			const mnemonic = LOADS[f3]!;
			return {
				...base,
				cls: "load",
				mnemonic,
				imm,
				usesRs1: true,
				writesRd: true,
				text: `${mnemonic} ${reg(rd)}, ${imm}[${reg(rs1)}]`,
			};
		}
		case 0x20: {
			const imm = sx(((ir >>> 7) & 0x1f) | ((ir >>> 20) & 0xfe0), 12);
			const mnemonic = STORES[f3]!;
			return {
				...base,
				cls: "store",
				mnemonic,
				imm,
				usesRs1: true,
				usesRs2: true,
				text: `${mnemonic} ${reg(rs2)}, ${imm}[${reg(rs1)}]`,
			};
		}
		case 0x10: {
			const imm = ir >> 20;
			let mnemonic = OPS[f3]!.replace(/^(\w+)$/, "$1i");
			if (f3 === 5 && ir & 0x40000000) mnemonic = "srai";
			const shown = f3 === 1 || f3 === 5 ? imm & 31 : imm;
			return {
				...base,
				cls: "op-imm",
				mnemonic,
				imm,
				usesRs1: true,
				writesRd: true,
				text: `${mnemonic} ${reg(rd)}, ${reg(rs1)}, ${shown}`,
			};
		}
		case 0x30: {
			const isMul = (ir & 0x02000000) !== 0;
			let mnemonic = isMul ? MULDIV[f3]! : OPS[f3]!;
			if (!isMul && ir & 0x40000000 && f3 === 0) mnemonic = "sub";
			if (!isMul && ir & 0x40000000 && f3 === 5) mnemonic = "sra";
			return {
				...base,
				cls: isMul ? "muldiv" : "op",
				mnemonic,
				usesRs1: true,
				usesRs2: true,
				writesRd: true,
				text: `${mnemonic} ${reg(rd)}, ${reg(rs1)}, ${reg(rs2)}`,
			};
		}
		case 0x34: {
			const imm = ir & 0xfffff000;
			return {
				...base,
				cls: "lui",
				mnemonic: "lui",
				imm,
				writesRd: true,
				text: `lui ${reg(rd)}, 0x${(imm >>> 12).toString(16)}`,
			};
		}
		case 0x14: {
			const imm = ir & 0xfffff000;
			return {
				...base,
				cls: "auipc",
				mnemonic: "auipc",
				imm,
				writesRd: true,
				text: `auipc ${reg(rd)}, 0x${(imm >>> 12).toString(16)}`,
			};
		}
		case 0x60: {
			const imm = sx(
				((ir >>> 7) & 0x1e) |
					((ir >>> 20) & 0x7e0) |
					((ir << 4) & 0x800) |
					((ir >>> 19) & 0x1000),
				13,
			);
			const mnemonic = BRANCHES[f3]!;
			return {
				...base,
				cls: "branch",
				mnemonic,
				imm,
				usesRs1: true,
				usesRs2: true,
				text: `${mnemonic} ${reg(rs1)}, ${reg(rs2)}, ${imm >= 0 ? "+" : ""}${imm}`,
			};
		}
		case 0x64: {
			const imm = ir >> 20;
			return {
				...base,
				cls: "jalr",
				mnemonic: "jalr",
				imm,
				usesRs1: true,
				writesRd: true,
				text: `jalr ${reg(rd)}, ${imm}[${reg(rs1)}]`,
			};
		}
		case 0x6c: {
			const imm = sx(
				((ir >>> 20) & 0x7fe) |
					((ir >>> 9) & 0x800) |
					(ir & 0xff000) |
					((ir >>> 11) & 0x100000),
				21,
			);
			return {
				...base,
				cls: "jal",
				mnemonic: "jal",
				imm,
				writesRd: true,
				text: `jal ${reg(rd)}, ${imm >= 0 ? "+" : ""}${imm}`,
			};
		}
		case 0x70: {
			if (ir === 0x73)
				return {
					...base,
					cls: "ecall",
					mnemonic: "ecall",
					text: "ecall",
				};
			if (ir === 0x100073)
				return {
					...base,
					cls: "ebreak",
					mnemonic: "ebreak",
					text: "ebreak",
				};
			if (f3 & 3) {
				const csr = (ir >>> 20) & 0xfff;
				const mnemonic = CSRS[f3]!;
				const src = f3 & 4 ? String(rs1) : reg(rs1);
				return {
					...base,
					cls: "csr",
					mnemonic,
					imm: csr,
					usesRs1: !(f3 & 4),
					writesRd: true,
					text: `${mnemonic} ${reg(rd)}, 0x${csr.toString(16)}, ${src}`,
				};
			}
			return {
				...base,
				cls: "nop",
				mnemonic: "system",
				text: "system (nop)",
			};
		}
		default:
			return {
				...base,
				cls: "nop",
				mnemonic: "nop",
				text: "(unsupported → nop)",
			};
	}
}
