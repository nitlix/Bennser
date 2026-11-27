"use client";

import {
	ABI_NAMES,
	decode,
	hex32,
	type Kmd,
	type MemAccess,
	MEMORY_WORDS,
} from "@bennser/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import PanelBase from "@/components/PanelBase";
import { evaluateAddress } from "./addressExpr";
import Menu, { MenuItem } from "./Menu";
import s from "./MemoryView.module.scss";
import { parseValue } from "./parseValue";
import { useStored } from "./useStored";

type Mode = "bytes" | "disasm" | "source" | "words2" | "words4" | "words8";

/** Ours (bytes + ASCII) first, then Bennett's: one word with disassembly/source, 2/4/8 words. */
const MODES: { id: Mode; label: string; name: string; words: number }[] = [
	{ id: "bytes", label: "Bytes", name: "8 bytes + ASCII", words: 0 },
	{ id: "disasm", label: "Disasm", name: "1 word + disassembly", words: 1 },
	{ id: "source", label: "Source", name: "1 word + source", words: 1 },
	{ id: "words2", label: "2 words", name: "2 words", words: 2 },
	{ id: "words4", label: "4 words", name: "4 words", words: 4 },
	{ id: "words8", label: "8 words", name: "8 words", words: 8 },
];

const ROWS = 16;
const MEMORY_BYTES = MEMORY_WORDS * 4;

type Props = {
	memory: Uint32Array;
	kmd: Kmd | null;
	access: MemAccess[];
	/** Default view start (e.g. the data section). */
	home: number;
	pc: number;
	registers: Uint32Array;
	onEdit: (address: number, byte: number) => void;
	onEditWord: (address: number, word: number) => void;
};

const sizeBytes = (a: MemAccess) => [1, 2, 4][a.size]!;
const byteAt = (memory: Uint32Array, address: number) =>
	(memory[address >>> 2]! >>> ((address & 3) * 8)) & 0xff;
const hex8 = (b: number) => b.toString(16).toUpperCase().padStart(2, "0");

export default function ({
	memory,
	kmd,
	access,
	home,
	pc,
	registers,
	onEdit,
	onEditWord,
}: Props) {
	const [modeId, setMode] = useStored<Mode>(
		"bennser:memoryMode",
		"bytes",
		(v) => MODES.some((m) => m.id === v),
	);
	const mode = MODES.find((m) => m.id === modeId)!;
	/** Bytes per cell (what one edit writes) and per row. */
	const unit = mode.words ? 4 : 1;
	const stride = mode.words ? mode.words * 4 : 8;
	const span = ROWS * stride;
	const align = (n: number) =>
		Math.max(0, Math.min(MEMORY_BYTES - span, n - (n % stride)));

	const [base, setBase] = useState(align(home));
	const [follow, setFollow] = useState(true);
	const [query, setQuery] = useState("");
	// Which cell is an input right now, and what's typed in it.
	const [editing, setEditing] = useState<{
		address: number;
		text: string;
	} | null>(null);
	// Mirrors editing.address synchronously, so the blur of an input we're moving away
	// from (Enter/Tab) doesn't commit a second time.
	const active = useRef<number | null>(null);
	const draft =
		editing &&
		parseValue(editing.text, { hex: true, bits: unit === 1 ? 8 : 32 });

	const symbols = kmd?.symbols ?? [];
	const labels = new Map(symbols.map((sym) => [sym.value, sym.name]));
	/** Address → its KMD source line (instructions and data). */
	const sources = useMemo(() => {
		const map = new Map<number, string>();
		for (const line of kmd?.lines ?? [])
			if (line.bytes.length && !map.has(line.address))
				map.set(line.address, line.source.trim());
		return map;
	}, [kmd]);

	// Like Bennett: labels, then pc and register names (ABI or xN), case-insensitively.
	const lookup = (name: string) => {
		const lower = name.toLowerCase();
		const label =
			symbols.find((sym) => sym.name === name) ??
			symbols.find((sym) => sym.name.toLowerCase() === lower);
		if (label) return label.value;
		if (lower === "pc") return pc;
		const x = /^x([12]?\d|3[01])$/.exec(lower);
		const reg = x
			? Number(x[1])
			: (ABI_NAMES as readonly string[]).indexOf(lower);
		return reg >= 0 ? registers[reg] : undefined;
	};
	const target = query.trim() ? evaluateAddress(query, lookup) : null;
	const invalid = !!query.trim() && target === null;

	useEffect(() => setBase(align(home)), [home]);

	// Re-align when the row width changes.
	useEffect(() => {
		setBase((b) => align(b));
		close();
	}, [stride, unit]);

	// Bennett re-evaluates the box continuously, so "pc" or "sp+8" keeps tracking.
	useEffect(() => {
		if (target !== null) setBase(align(target));
	}, [target, stride]);

	// Follow loads/stores into view.
	const accessed = access[0]?.address;
	useEffect(() => {
		if (!follow || accessed === undefined) return;
		if (accessed < base || accessed >= base + span)
			setBase(align(accessed - stride * 4));
	}, [follow, accessed, base, span]);

	const reads = new Set<number>();
	const writes = new Set<number>();
	for (const a of access) {
		for (let i = 0; i < sizeBytes(a); i++)
			(a.kind === "write" ? writes : reads).add(a.address + i);
	}
	const anyIn = (set: Set<number> | Map<number, unknown>, a: number) =>
		Array.from({ length: unit }, (_, i) => a + i).some((b) => set.has(b));

	const valueAt = (address: number) =>
		unit === 1 ? byteAt(memory, address) : memory[address >>> 2]!;
	const show = (value: number) => (unit === 1 ? hex8(value) : hex32(value));

	const open = (address: number) => {
		if (address < 0 || address >= MEMORY_BYTES) return close();
		active.current = address;
		setEditing({ address, text: show(valueAt(address)) });
		// Keep the cell on screen while typing through memory: scroll by a row.
		if (address < base) setBase(align(address));
		else if (address >= base + span)
			setBase(align(address - span + stride));
	};

	function close() {
		active.current = null;
		setEditing(null);
	}

	/** Commit the draft; then edit `next` if given, else stop. Invalid drafts stay open. */
	const commit = (next?: number) => {
		if (!editing) return;
		if (draft === null) {
			if (next === undefined) close();
			return;
		}
		(unit === 1 ? onEdit : onEditWord)(editing.address, draft);
		if (next === undefined) close();
		else open(next);
	};

	const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const address = editing!.address;
		if (e.key === "Escape") close();
		if (e.key === "Enter") commit(address + unit);
		if (e.key === "Tab") {
			e.preventDefault();
			commit(address + (e.shiftKey ? -unit : unit));
		}
	};

	function go(e: React.FormEvent) {
		e.preventDefault();
		if (target !== null) setBase(align(target));
	}

	const actions = (
		<form onSubmit={go} className="flex flex-row items-center gap-[.4rem]">
			<input
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="PC, label, 0xFF03, 323"
				spellCheck={false}
				aria-invalid={invalid}
				title={
					target !== null
						? `Evaluates to 0x${hex32(target)} (${target})`
						: "Address to view: a number (decimal, or 0x hex), pc, a register or a label, with + - * / and brackets, e.g. sp+8"
				}
				className={twMerge(
					"w-[8.5rem] h-[1.85rem] px-[.6rem] rounded-[.55rem] border-[1px] border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 text-black dark:text-white text-[1rem] md:text-[.8rem] outline-none",
					invalid && "border-red-500 dark:border-red-500",
				)}
			/>
			<Menu
				label={mode.label}
				title="Display mode"
				size="small"
				align="right"
			>
				{(closeMenu) =>
					MODES.map((m) => (
						<MenuItem
							key={m.id}
							role="menuitemradio"
							aria-checked={m.id === mode.id}
							onClick={() => {
								setMode(m.id);
								closeMenu();
							}}
						>
							<LuCheck
								size={16}
								className={twMerge(
									"shrink-0 text-amber-500",
									m.id !== mode.id && "invisible",
								)}
							/>
							{m.name}
						</MenuItem>
					))
				}
			</Menu>
			<ButtonSecondary
				size="small"
				aria-pressed={follow}
				onClick={() => setFollow((f) => !f)}
				title="Jump to each load and store"
			>
				Follow
			</ButtonSecondary>
		</form>
	);

	const cell = (a: number) => {
		const isEditing = editing?.address === a;
		const value = valueAt(a);
		return (
			<span
				key={a}
				className={twMerge(
					s.cell,
					isEditing && s.editing,
					isEditing && draft === null && s.invalid,
					value
						? "text-black dark:text-white"
						: "text-neutral-400 dark:text-neutral-600",
					anyIn(labels, a) &&
						"underline decoration-neutral-400 underline-offset-[.2rem]",
					anyIn(reads, a) && "bg-sky-500/25",
					anyIn(writes, a) && "bg-amber-500/30",
				)}
				title={`0x${hex32(a)}. Click to edit.`}
				onClick={() => !isEditing && open(a)}
			>
				{isEditing ? (
					<input
						autoFocus
						spellCheck={false}
						maxLength={unit === 1 ? 10 : 34}
						aria-label={`New ${unit === 1 ? "byte" : "word"} at 0x${hex32(a)}`}
						className={twMerge(s.input, unit === 4 && s.word)}
						value={editing.text}
						onFocus={(e) => e.currentTarget.select()}
						onChange={(e) =>
							setEditing({ address: a, text: e.target.value })
						}
						onBlur={() => active.current === a && commit()}
						onKeyDown={keyDown}
					/>
				) : (
					show(value)
				)}
			</span>
		);
	};

	/** Per-mode trailing column: ASCII, disassembly (+ source), or source. */
	const extra = (start: number) => {
		if (mode.id === "bytes")
			return (
				<span className="text-neutral-500">
					{Array.from({ length: stride }, (_, i) => {
						const b = byteAt(memory, start + i);
						return b >= 32 && b < 127
							? String.fromCharCode(b)
							: "·";
					})}
				</span>
			);
		if (mode.id === "disasm") {
			const word = memory[start >>> 2]!;
			return (
				<>
					<span
						className={twMerge(
							"min-w-[22ch]",
							word
								? "text-black dark:text-white"
								: "text-neutral-400 dark:text-neutral-600",
						)}
					>
						{decode(word).text}
					</span>
					<span className="text-neutral-500">
						{sources.get(start)}
					</span>
				</>
			);
		}
		if (mode.id === "source")
			return (
				<span className="text-black dark:text-white">
					{sources.get(start)}
				</span>
			);
		return null;
	};

	return (
		<PanelBase title="Memory" actions={actions}>
			<div
				className="flex-1 min-h-0 py-[.5rem] font-mono text-[.8rem] leading-[1.5rem] overflow-auto"
				data-lenis-prevent
			>
				{/* w-max so wide rows (8 words) scroll sideways with full-width highlights. */}
				<div className="flex flex-col w-max min-w-full">
					{Array.from({ length: ROWS }, (_, row) => {
						const start = base + row * stride;
						const cells = Array.from(
							{ length: stride / unit },
							(_, i) => start + i * unit,
						);
						const label = Array.from({ length: stride }, (_, i) =>
							labels.get(start + i),
						).find(Boolean);
						const sp = registers[2]!;
						const isPc = mode.words === 1 && start === pc;

						return (
							<div
								key={start}
								className={twMerge(
									"flex flex-row items-center gap-[.75rem] px-[.85rem] whitespace-pre",
									isPc &&
										"bg-black/[.06] dark:bg-white/[.07]",
								)}
							>
								<span
									className={twMerge(
										"text-neutral-400 dark:text-neutral-600",
										start <= sp &&
											sp < start + stride &&
											"text-amber-500",
									)}
								>
									{hex32(start)}
								</span>
								<span
									className={twMerge(
										"flex flex-row",
										unit === 1
											? "gap-[.35rem]"
											: "gap-[.6rem]",
									)}
								>
									{cells.map(cell)}
								</span>
								{extra(start)}
								{label && (
									<span className="text-sky-500">
										{label}
									</span>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</PanelBase>
	);
}
