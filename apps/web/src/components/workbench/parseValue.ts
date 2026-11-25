/**
 * Typed cell value → an unsigned `bits`-wide number, or null if it isn't one. Used by the
 * register table and the memory editor. 0x / 0b / 'c' / a leading minus are explicit; bare
 * digits are hex when `hex` is set (the cell is showing hex), else decimal.
 */
export function parseValue(
	text: string,
	{ hex, bits }: { hex: boolean; bits: 8 | 32 },
): number | null {
	const max = 2 ** bits - 1;
	const t = text.trim();
	const char = /^'(.)'?$/u.exec(t);
	if (char) {
		const code = char[1]!.codePointAt(0)!;
		return code <= max ? code : null;
	}

	const m = /^(-)?(0x[0-9a-f]+|0b[01]+|[0-9a-f]+)$/i.exec(t);
	if (!m) return null;
	const [, minus, digits] = m;
	const prefixed = /^0[xb]/i.test(digits!);
	const hexBare = !prefixed && !minus && hex;
	if (!prefixed && !hexBare && !/^\d+$/.test(digits!)) return null;

	const value = Number(hexBare ? `0x${digits}` : digits);
	if (value > max || (minus && value > 2 ** (bits - 1))) return null;
	const signed = minus ? -value : value;
	return bits === 32 ? signed >>> 0 : signed & max;
}
