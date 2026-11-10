import { type Handler, type RV32, Size } from "./RV32";

/** a7 selector values, mirroring emulator/15111_handler.cpp */
export enum Ecall {
	WriteChar = 0,
	ReadChar = 1,
	WriteString = 2,
	WriteDecimal = 3,
	Stop = 5,
}

const A0 = 10;
const A7 = 17;
const MAX_FIFO_OUT = 15;
const MAX_STRING = 128;

const pushString = (cpu: RV32, text: string) => {
	for (let i = 0; i < text.length; i++)
		cpu.fifoOut.push(text.charCodeAt(i) & 0xff);
};

/** Unknown selectors return false, which stalls the CPU forever (as upstream). */
export const comp15111: Handler = {
	ecall(cpu) {
		const a0 = cpu.registers[A0]!;

		switch (cpu.registers[A7]) {
			case Ecall.WriteChar:
				if (cpu.fifoOut.length > MAX_FIFO_OUT) return false;
				cpu.fifoOut.push(a0 & 0xff);
				return true;

			case Ecall.Stop:
				cpu.status = 0x45;
				return true;

			case Ecall.WriteString:
				for (let i = 0; i < MAX_STRING; i++) {
					const ch = cpu.memReadOr(a0 + i, Size.Byte);
					if (ch === 0) break;
					cpu.fifoOut.push(ch & 0xff);
				}
				return true;

			case Ecall.ReadChar: {
				const input = cpu.fifoIn.shift();
				if (input === undefined) return false;
				if (cpu.lastTrace) cpu.lastTrace.inputByte = input;
				cpu.regWrite(A0, input);
				return true;
			}

			case Ecall.WriteDecimal:
				pushString(cpu, String(a0 | 0));
				return true;

			default:
				return false;
		}
	},
};
