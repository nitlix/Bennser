/**
 * The memory panel's address box, modelled on Bennett's CustomExpressionEvaluator (tinyexpr,
 * decimal by default). Accepts numbers (bare digits are decimal, `0x` hex, `0b` binary), names
 * resolved by `lookup` (pc, registers, labels), unary minus, + - * / and brackets.
 * Returns the address as a u32, or null if the expression doesn't evaluate.
 */
export function evaluateAddress(
	text: string,
	lookup: (name: string) => number | undefined,
): number | null {
	const tokens: string[] = [];
	const re = /\s*(0x[0-9a-f]+|0b[01]+|\d+|[a-z_.$][\w.$]*|[-+*/()])/iy;
	let at = 0;
	const src = text.trim();
	while (at < src.length) {
		re.lastIndex = at;
		const m = re.exec(src);
		if (!m) return null;
		tokens.push(m[1]!);
		at = re.lastIndex;
	}
	if (!tokens.length) return null;

	let i = 0;
	const peek = () => tokens[i];

	const atom = (): number => {
		const t = tokens[i++];
		if (t === undefined) return NaN;
		if (t === "(") {
			const value = sum();
			return tokens[i++] === ")" ? value : NaN;
		}
		if (/^\d|^0[xb]/i.test(t)) return Number(t);
		return lookup(t) ?? NaN;
	};

	const unary = (): number => {
		const sign = peek();
		if (sign !== "-" && sign !== "+") return atom();
		i++;
		return sign === "-" ? -unary() : unary();
	};

	const product = (): number => {
		let value = unary();
		while (peek() === "*" || peek() === "/") {
			const op = tokens[i++];
			const rhs = unary();
			value =
				op === "*" ? value * rhs : rhs ? Math.trunc(value / rhs) : NaN;
		}
		return value;
	};

	function sum(): number {
		let value = product();
		while (peek() === "+" || peek() === "-") {
			const op = tokens[i++];
			const rhs = product();
			value = op === "+" ? value + rhs : value - rhs;
		}
		return value;
	}

	const value = sum();
	if (i !== tokens.length || !Number.isFinite(value)) return null;
	return value >>> 0;
}
