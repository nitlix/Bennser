"use client";

import {
	hex32,
	type KmdSymbol,
	type MemAccess,
	MEMORY_WORDS,
} from "@bennser/core";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import PanelBase from "@/components/PanelBase";

const ROWS = 16;
const PER_ROW = 8;
const SPAN = ROWS * PER_ROW;
const MEMORY_BYTES = MEMORY_WORDS * 4;

type Props = {
	memory: Uint32Array;
	symbols: KmdSymbol[];
	access: MemAccess[];
	/** Default view start (e.g. the data section). */
	home: number;
	sp: number;
};

const sizeBytes = (a: MemAccess) => [1, 2, 4][a.size]!;
const byteAt = (memory: Uint32Array, address: number) =>
	(memory[address >>> 2]! >>> ((address & 3) * 8)) & 0xff;
const align = (n: number) =>
	Math.max(0, Math.min(MEMORY_BYTES - SPAN, n - (n % PER_ROW)));

export default function ({ memory, symbols, access, home, sp }: Props) {
	const [base, setBase] = useState(align(home));
	const [follow, setFollow] = useState(true);
	const [query, setQuery] = useState("");

	useEffect(() => setBase(align(home)), [home]);

	// Follow loads/stores into view.
	const target = access[0]?.address;
	useEffect(() => {
		if (!follow || target === undefined) return;
		if (target < base || target >= base + SPAN)
			setBase(align(target - PER_ROW * 4));
	}, [follow, target, base]);

	const reads = new Set<number>();
	const writes = new Set<number>();
	for (const a of access) {
		for (let i = 0; i < sizeBytes(a); i++)
			(a.kind === "write" ? writes : reads).add(a.address + i);
	}

	const labels = new Map(symbols.map((s) => [s.value, s.name]));

	function go(e: React.FormEvent) {
		e.preventDefault();
		const text = query.trim();
		const symbol = symbols.find((s) => s.name === text);
		const value =
			symbol?.value ??
			(text === "sp" ? sp : parseInt(text.replace(/^0x/i, ""), 16));
		if (!Number.isNaN(value)) setBase(align(value));
	}

	const actions = (
		<form onSubmit={go} className="flex flex-row items-center gap-[.4rem]">
			<input
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Address, label or sp"
				className="w-[8.5rem] h-[1.85rem] px-[.6rem] rounded-[.55rem] border-[1px] border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 text-black dark:text-white font-mono text-[1rem] md:text-[.75rem]"
			/>
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

	return (
		<PanelBase title="Memory" actions={actions}>
			<div
				className="flex flex-col px-[.85rem] py-[.5rem] font-mono text-[.8rem] leading-[1.5rem] overflow-auto"
				data-lenis-prevent
			>
				{Array.from({ length: ROWS }, (_, row) => {
					const start = base + row * PER_ROW;
					const bytes = Array.from(
						{ length: PER_ROW },
						(_, i) => start + i,
					);
					const label = bytes.map((a) => labels.get(a)).find(Boolean);

					return (
						<div
							key={start}
							className="flex flex-row items-center gap-[.75rem] whitespace-pre"
						>
							<span
								className={twMerge(
									"text-neutral-400 dark:text-neutral-600",
									start <= sp &&
										sp < start + PER_ROW &&
										"text-amber-500",
								)}
							>
								{hex32(start)}
							</span>
							<span className="flex flex-row gap-[.35rem]">
								{bytes.map((a) => (
									<span
										key={a}
										className={twMerge(
											"rounded-[.2rem] px-[.1rem]",
											byteAt(memory, a)
												? "text-black dark:text-white"
												: "text-neutral-400 dark:text-neutral-600",
											labels.has(a) &&
												"underline decoration-neutral-400 underline-offset-[.2rem]",
											reads.has(a) && "bg-sky-500/25",
											writes.has(a) && "bg-amber-500/30",
										)}
									>
										{byteAt(memory, a)
											.toString(16)
											.toUpperCase()
											.padStart(2, "0")}
									</span>
								))}
							</span>
							<span className="text-neutral-500">
								{bytes.map((a) => {
									const b = byteAt(memory, a);
									return b >= 32 && b < 127
										? String.fromCharCode(b)
										: "·";
								})}
							</span>
							{label && (
								<span className="text-sky-500 truncate">
									{label}
								</span>
							)}
						</div>
					);
				})}
			</div>
		</PanelBase>
	);
}
