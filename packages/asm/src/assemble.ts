/** Emscripten module factory produced by build.ts. */
// biome-ignore lint/suspicious/noExplicitAny: untyped emscripten output
export type AsmFactory = (opts: Record<string, unknown>) => Promise<any>;

export type AssembleResult =
	| { ok: true; kmd: string; log: string }
	| { ok: false; log: string; errors: AssembleError[] };

export type AssembleError = {
	line: number;
	message: string;
	source: string;
	column: number;
};

export type AssembleOptions = {
	/** Name shown in error messages. */
	filename?: string;
	/** Extra files available to `include`/`get`, keyed by relative path. */
	files?: Record<string, string>;
};

const ERROR = /^(.*) on line (\d+) of file: .*$/;

/** Turn upstream's "msg on line N of file: f\n<src>\n   ^" triples into objects. */
function parseErrors(log: string): AssembleError[] {
	const lines = log.split("\n");
	const errors: AssembleError[] = [];

	lines.forEach((text, i) => {
		const m = ERROR.exec(text);
		if (!m) return;
		const caret = lines[i + 2] ?? "";
		errors.push({
			message: m[1]!,
			line: Number(m[2]),
			source: lines[i + 1] ?? "",
			column: Math.max(0, caret.indexOf("^")),
		});
	});

	return errors;
}

/**
 * Assemble Manchester-dialect RISC-V source to KMD using the upstream assembler (WASM).
 * A fresh instance is used per call since the C++ keeps global pass state.
 */
export async function assembleWith(
	createRiscvAsm: AsmFactory,
	source: string,
	opts: AssembleOptions = {},
): Promise<AssembleResult> {
	const name = opts.filename ?? "program.s";
	const output: string[] = [];

	const mod = await createRiscvAsm({
		print: (s: string) => output.push(s),
		printErr: (s: string) => output.push(s),
		// Default quit calls process.exit under Node; keep the host alive.
		quit: (_status: number, toThrow: unknown) => {
			throw toThrow;
		},
	});

	mod.FS.mkdir("/work");
	mod.FS.chdir("/work");

	for (const [path, text] of Object.entries(opts.files ?? {})) {
		const dir = path.split("/").slice(0, -1).join("/");
		if (dir) mod.FS.mkdirTree(dir);
		mod.FS.writeFile(path, text);
	}
	mod.FS.writeFile(name, source);

	try {
		mod.callMain([name, "-lk", "out.kmd"]);
	} catch (e) {
		// exit(-1) surfaces as an ExitStatus throw; anything else is a real crash.
		if (!(e && typeof e === "object" && "status" in e)) throw e;
	}

	const log = output
		.filter((l) => !/^(Input file|List file in):/.test(l))
		.join("\n");
	const kmd = mod.FS.analyzePath("out.kmd").exists
		? (mod.FS.readFile("out.kmd", { encoding: "utf8" }) as string)
		: null;

	if (!kmd) return { ok: false, log, errors: parseErrors(log) };
	return { ok: true, kmd, log };
}
