/** Parser for the `.kmd` listing format emitted by `riscvasm -lk`. */

export type KmdLine = {
	address: number;
	/** Bytes emitted on this line, in memory order. */
	bytes: number[];
	/** Width of each emitted chunk in bytes (4 for instructions, 1 for defb, ...). */
	chunk: number;
	source: string;
	/** 1-based line index within the KMD body. */
	index: number;
	/** 1-based line in the assembled source file (continuation rows share their parent's). */
	sourceLine: number;
	/** Emitted by a data directive (defb/defw/defs/...), not an instruction. */
	data: boolean;
};

export type KmdSymbol = { name: string; value: number; kind: string };

export type Kmd = {
	lines: KmdLine[];
	symbols: KmdSymbol[];
	/** address → source line, for instructions only. */
	sourceAt: Map<number, KmdLine>;
};

const LINE = /^([0-9A-Fa-f]{8}):\s?((?:[0-9A-Fa-f]{2,8} )*)\s*;\s?(.*)$/;
/** Optional label, then a data directive. */
const DATA_DIRECTIVE =
	/^\s*(?:[\w.%]+:?\s+)?(?:def[bhws]|dc[bwd]|ds|byte|half|halfword|word|double|doubleword|align)\b/i;

const SYMBOL = /^:\s*(\S+)\s+([0-9A-Fa-f]{8})\s+(\S+)/;

export function parseKmd(text: string): Kmd {
	const lines: KmdLine[] = [];
	const symbols: KmdSymbol[] = [];
	const sourceAt = new Map<number, KmdLine>();
	let lastWithSource: KmdLine | null = null;
	let sourceLine = 0;

	text.split(/\r?\n/).forEach((raw, i) => {
		const sym = SYMBOL.exec(raw);
		if (sym) {
			symbols.push({
				name: sym[1]!,
				value: parseInt(sym[2]!, 16),
				kind: sym[3]!,
			});
			return;
		}

		const m = LINE.exec(raw);
		if (!m) return;

		const chunks = m[2]!.trim().split(/\s+/).filter(Boolean);
		const chunk = chunks[0] ? chunks[0].length / 2 : 0;
		const bytes: number[] = [];

		for (const hex of chunks) {
			const value = parseInt(hex, 16);
			const width = hex.length / 2;
			for (let b = 0; b < width; b++)
				bytes.push((value >>> (8 * b)) & 0xff);
		}

		// Continuation lines (e.g. 2nd word of `li`) emit bytes with no source; inherit the previous one.
		// Every other row (including blank source lines) is the next line of the source file.
		const continuation =
			!m[3]!.length && bytes.length > 0 && lastWithSource !== null;
		if (!continuation) sourceLine++;
		const source = continuation ? lastWithSource!.source : m[3]!;
		const line: KmdLine = {
			address: parseInt(m[1]!, 16),
			bytes,
			chunk,
			source,
			index: i + 1,
			sourceLine,
			data: DATA_DIRECTIVE.test(source) || chunk === 1 || chunk === 2,
		};
		if (m[3]!.length) lastWithSource = line;

		lines.push(line);
		if (chunk === 4 && !line.data) sourceAt.set(line.address, line);
	});

	return { lines, symbols, sourceAt };
}
