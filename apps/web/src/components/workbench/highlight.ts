/** Tiny tokenizer for Bennett's Manchester RISC-V dialect, used to colour the source editor. */

export type TokenKind =
	| "comment"
	| "label"
	| "mnemonic"
	| "directive"
	| "register"
	| "literal"
	| "local";
export type Token = { text: string; kind: TokenKind | null };

/** Every F0/F4/F8 entry in upstream's mnemonics table. */
const DIRECTIVES = new Set(
	(
		"arch architecture arm thumb dcb dcd dcw defb defh defw defs define def else endif fi entry export get if import include " +
		"literal literals ltorg pool set cn cp rn alias align byte double doubleword equ half halfword org origin " +
		"rec_align record struct struct_align structure word"
	).split(" "),
);

const REGISTER =
	/^(x([0-9]|[12][0-9]|3[01])|zero|ra|sp|gp|tp|fp|pc|t[0-6]|s([0-9]|1[01])|a[0-7])$/i;

/** Operand-level tokens, tried in order at each position. */
const OPERAND_RULES: [RegExp, TokenKind | "word" | null][] = [
	[/^"(?:\\.|[^"\\])*"?/, "literal"],
	[/^'(?:\\.|[^'\\])*'?/, "literal"],
	[/^%[a-z]*\d+\w*/i, "local"],
	[/^(?:0x[0-9a-f_]+|0b[01_]+|&[0-9a-f]+|\d+)\b/i, "literal"],
	[/^[A-Za-z_.$][\w.$]*/, "word"],
	[/^\s+/, null],
	[/^./, null],
];

/** Index of the first `;` that isn't inside a string or char literal. */
function commentStart(line: string) {
	let quote: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quote) {
			if (c === "\\") i++;
			else if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'") quote = c;
		else if (c === ";") return i;
	}
	return -1;
}

function tokenizeOperands(text: string, out: Token[]) {
	let rest = text;
	while (rest) {
		for (const [re, kind] of OPERAND_RULES) {
			const m = re.exec(rest);
			if (!m) continue;
			const word = m[0];
			const resolved =
				kind === "word"
					? REGISTER.test(word)
						? "register"
						: null
					: kind;
			out.push({ text: word, kind: resolved });
			rest = rest.slice(word.length);
			break;
		}
	}
}

export function tokenizeLine(line: string): Token[] {
	const out: Token[] = [];
	const cut = commentStart(line);
	let code = cut === -1 ? line : line.slice(0, cut);
	const comment = cut === -1 ? "" : line.slice(cut);

	// A label is a word in column 0, or any leading word followed by a colon.
	const label = /^(\s*)([\w.$%]+:)/.exec(code) ?? /^()([\w.$%]+)/.exec(code);
	if (label) {
		if (label[1]) out.push({ text: label[1], kind: null });
		out.push({ text: label[2], kind: "label" });
		code = code.slice(label[0].length);
	}

	// The next word is the mnemonic or directive.
	const op = /^(\s*)([A-Za-z_][\w.]*)/.exec(code);
	if (op) {
		if (op[1]) out.push({ text: op[1], kind: null });
		out.push({
			text: op[2],
			kind: DIRECTIVES.has(op[2].toLowerCase())
				? "directive"
				: "mnemonic",
		});
		code = code.slice(op[0].length);
	}

	tokenizeOperands(code, out);
	if (comment) out.push({ text: comment, kind: "comment" });
	return out;
}
