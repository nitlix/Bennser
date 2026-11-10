import { type Decoded, decode, hex32, type StepTrace } from "@bennser/core";

/** Geometry for the single-cycle datapath, in SVG user units (viewBox 0 0 880 380). */

export type Block = {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	label: string[];
	shape?: "alu" | "mux";
};

export const BLOCKS: Block[] = [
	{ id: "pc", x: 20, y: 160, w: 50, h: 50, label: ["PC"] },
	{ id: "add4", x: 100, y: 60, w: 56, h: 36, label: ["+4"] },
	{ id: "imem", x: 100, y: 145, w: 90, h: 80, label: ["Instr", "memory"] },
	{ id: "dec", x: 220, y: 145, w: 80, h: 80, label: ["Decode"] },
	{ id: "imm", x: 220, y: 270, w: 80, h: 36, label: ["Imm"] },
	{ id: "rf", x: 340, y: 120, w: 110, h: 130, label: ["Register", "file"] },
	{ id: "mux", x: 490, y: 195, w: 18, h: 50, label: [], shape: "mux" },
	{ id: "alu", x: 540, y: 120, w: 60, h: 130, label: ["ALU"], shape: "alu" },
	{ id: "tgt", x: 540, y: 36, w: 60, h: 40, label: ["PC+imm"] },
	{ id: "dmem", x: 640, y: 145, w: 100, h: 80, label: ["Data", "memory"] },
	{ id: "wb", x: 780, y: 140, w: 18, h: 95, label: [], shape: "mux" },
	{ id: "io", x: 640, y: 280, w: 100, h: 44, label: ["ecall I/O"] },
];

export const WIRES: Record<string, string> = {
	pc_imem: "M70 185 H100",
	pc_add4: "M45 160 V78 H100",
	add4_next: "M156 78 H170 V20",
	next_bus: "M170 20 H8 V185 H20",
	tgt_next: "M600 56 H620 V20 H170",
	alu_next: "M600 185 H612 V20 H170",
	pc_tgt: "M45 120 H80 V50 H540",
	imm_tgt: "M300 280 H320 V66 H540",
	imem_dec: "M190 185 H220",
	dec_rf: "M300 185 H340",
	dec_imm: "M260 225 V270",
	rs1_alu: "M450 150 H540",
	rs2_mux: "M450 215 H490",
	imm_mux: "M300 298 H480 V235 H490",
	mux_alu: "M508 220 H540",
	pc_alu: "M45 210 V345 H525 V162 H540",
	alu_dmem: "M600 185 H625 V170 H640",
	alu_wb: "M600 185 H625 V130 H770 V160 H780",
	rs2_dmem: "M470 215 V262 H630 V205 H640",
	dmem_wb: "M740 185 H780",
	pc4_wb: "M156 88 H180 V108 H760 V210 H780",
	rf_io: "M430 250 V302 H640",
	io_wb: "M740 302 H765 V225 H780",
	wb_rf: "M798 187 H830 V365 H395 V250",
};

export type Label = { at: [number, number]; text: string; wire: string };

export type Flow = {
	decoded: Decoded;
	active: Set<string>;
	labels: Label[];
	summary: string;
};

const NEXT_SEQ = ["pc_add4", "add4_next", "next_bus"];
const NEXT_TGT = ["pc_tgt", "imm_tgt", "tgt_next", "next_bus"];
const NEXT_JALR = ["alu_next", "next_bus"];

const h = (n: number) => `0x${hex32(n)}`;
const d = (n: number) => String(n | 0);

/** Which wires carry data for this instruction, and what values they carry. */
export function flowOf(trace: StepTrace): Flow {
	const decoded = decode(trace.ir);
	const wires: string[] = ["pc_imem", "imem_dec"];
	const labels: Label[] = [
		{ at: [85, 140], text: h(trace.pc), wire: "pc_imem" },
		{ at: [205, 140], text: hex32(trace.ir), wire: "imem_dec" },
	];

	const reads = trace.regReads;
	const rs1v = reads.find((r) => r.reg === decoded.rs1)?.value ?? 0;
	const rs2v =
		reads.find((r) => r.reg === decoded.rs2 && decoded.usesRs2)?.value ?? 0;
	const write = trace.regWrites[0];
	const mem = trace.mem.find((m) => m.kind === "write") ?? trace.mem[0];

	const rs1 = () => {
		wires.push("dec_rf", "rs1_alu");
		labels.push({ at: [495, 142], text: d(rs1v), wire: "rs1_alu" });
	};
	const rs2 = () => {
		wires.push("dec_rf", "rs2_mux");
		labels.push({ at: [470, 230], text: d(rs2v), wire: "rs2_mux" });
	};
	const imm = (viaMux = true) => {
		wires.push("dec_imm");
		if (viaMux) wires.push("imm_mux", "mux_alu");
		labels.push({ at: [390, 290], text: d(decoded.imm), wire: "dec_imm" });
	};
	const writeback = (from: string, at: [number, number] = [610, 357]) => {
		if (!write) return;
		wires.push(from, "wb_rf");
		labels.push({
			at,
			text: `${decoded.rd ? `x${decoded.rd}` : ""} ← ${d(write.value)}`,
			wire: "wb_rf",
		});
	};
	const aluOut = (text: string) =>
		labels.push({ at: [690, 122], text, wire: "alu_wb" });

	let summary = decoded.text;
	let next = NEXT_SEQ;

	switch (decoded.cls) {
		case "op":
		case "muldiv":
			rs1();
			rs2();
			wires.push("mux_alu");
			if (write) aluOut(d(write.value));
			writeback("alu_wb");
			break;
		case "op-imm":
			rs1();
			imm();
			if (write) aluOut(d(write.value));
			writeback("alu_wb");
			break;
		case "lui":
			imm();
			if (write) aluOut(h(write.value));
			writeback("alu_wb");
			break;
		case "auipc":
			wires.push("pc_alu");
			imm();
			if (write) aluOut(h(write.value));
			writeback("alu_wb");
			break;
		case "load":
			rs1();
			imm();
			wires.push("alu_dmem");
			if (mem)
				labels.push({
					at: [625, 245],
					text: `[${h(mem.address)}]`,
					wire: "alu_dmem",
				});
			writeback("dmem_wb");
			break;
		case "store":
			rs1();
			imm();
			wires.push("rs2_dmem", "dec_rf");
			if (mem) {
				labels.push({
					at: [625, 245],
					text: `[${h(mem.address)}]`,
					wire: "alu_dmem",
				});
				labels.push({
					at: [550, 272],
					text: `${d(mem.value)} →`,
					wire: "rs2_dmem",
				});
			}
			wires.push("alu_dmem");
			break;
		case "branch":
			rs1();
			rs2();
			wires.push("mux_alu");
			imm(false);
			summary += trace.branchTaken ? "  → taken" : "  → not taken";
			if (trace.branchTaken) next = NEXT_TGT;
			break;
		case "jal":
			imm(false);
			next = NEXT_TGT;
			writeback("pc4_wb");
			break;
		case "jalr":
			rs1();
			imm();
			next = NEXT_JALR;
			writeback("pc4_wb");
			break;
		case "ecall": {
			const a7 = trace.ecall ?? 0;
			wires.push("dec_rf", "rf_io");
			const names: Record<number, string> = {
				0: "print char",
				1: "read char",
				2: "print string",
				3: "print int",
				5: "stop",
			};
			summary = `ecall ${a7}: ${names[a7] ?? "unknown (hangs)"}`;
			labels.push({ at: [540, 315], text: `a7=${a7}`, wire: "rf_io" });
			if (trace.inputByte !== undefined) writeback("io_wb");
			break;
		}
		case "csr":
			if (decoded.usesRs1) rs1();
			writeback("alu_wb");
			break;
		default:
			next = NEXT_SEQ;
	}

	wires.push(...next);
	labels.push({
		at: [330, 13],
		text: `next pc ${h(trace.nextPc)}`,
		wire: "next_bus",
	});

	return { decoded, active: new Set(wires), labels, summary };
}
