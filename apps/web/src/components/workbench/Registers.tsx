"use client";

import { ABI_NAMES, hex32, type StepTrace } from "@bennser/core";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import PanelBase from "@/components/PanelBase";
import PillBase from "@/components/PillBase";
import { parseValue } from "./parseValue";
import s from "./Registers.module.scss";
import { useStored } from "./useStored";

type Format = "hex" | "dec" | "chr";

const FORMATS: { id: Format; short: string; full: string }[] = [
	{ id: "hex", short: "Hex", full: "Hexadecimal" },
	{ id: "dec", short: "Dec", full: "Decimal" },
	{ id: "chr", short: "Char", full: "Character" },
];

const show = (value: number, format: Format) => {
	if (format === "dec") return String(value | 0);
	if (format === "hex") return hex32(value);
	const b = value & 0xff;
	return b >= 32 && b < 127 ? `'${String.fromCharCode(b)}'` : hex32(value);
};

/** Grey, borderless name tag for pc and the register ABI names. */
export const NamePill = ({ children }: { children: React.ReactNode }) => (
	<PillBase className="h-[1.3rem] px-[.4rem] rounded-[.35rem] border-0 bg-neutral-500 dark:bg-neutral-800 text-white dark:text-white font-sans text-[.8rem] font-[500]">
		{children}
	</PillBase>
);

type Props = {
	registers: Uint32Array;
	pc: number;
	trace: StepTrace | null;
	onEdit: (reg: number, value: number) => void;
	/** Bennett's "Zero registers": x1–x31 and PC to 0. */
	onZero: () => void;
};

export default function ({ registers, pc, trace, onEdit, onZero }: Props) {
	const [format, setFormat] = useStored<Format>(
		"bennser:registerFormat",
		"hex",
		(v) => FORMATS.some((f) => f.id === v),
	);
	const written = new Set(trace?.regWrites.map((w) => w.reg));
	const read = new Set(trace?.regReads.map((r) => r.reg));
	// Which register's value is an input right now, and what's typed in it.
	const [editing, setEditing] = useState<{
		reg: number;
		text: string;
	} | null>(null);
	const draft =
		editing &&
		parseValue(editing.text, { hex: format === "hex", bits: 32 });

	const open = (reg: number) => {
		if (reg === 0 || editing?.reg === reg) return;
		const value = registers[reg]!;
		setEditing({
			reg,
			text: format === "hex" ? hex32(value) : String(value | 0),
		});
	};

	const commit = () => {
		if (editing && draft !== null) onEdit(editing.reg, draft);
		setEditing(null);
	};

	const actions = (
		<div className="flex flex-row gap-[.3rem]">
			{/* Full names once the panel itself (not the window) is wide enough. */}
			{FORMATS.map((f) => (
				<ButtonSecondary
					key={f.id}
					size="small"
					aria-pressed={f.id === format}
					onClick={() => setFormat(f.id)}
					title={f.full}
				>
					<span className="@[32rem]/registers:hidden">{f.short}</span>
					<span className="hidden @[32rem]/registers:inline">
						{f.full}
					</span>
				</ButtonSecondary>
			))}
			<ButtonSecondary
				size="small"
				onClick={() => {
					setEditing(null);
					onZero();
				}}
				title="Set every register (and PC) to 0"
			>
				Zero
			</ButtonSecondary>
		</div>
	);

	return (
		<PanelBase
			title="Registers"
			actions={actions}
			className="@container/registers"
		>
			<div
				className="flex-1 min-h-0 overflow-auto pb-[1px]"
				data-lenis-prevent
			>
				<div className={s.table}>
					<div className={twMerge(s.cell, s.pc)}>
						<span className="flex flex-row items-center gap-[.5rem] font-sans text-[.8rem] text-neutral-500">
							<NamePill>PC</NamePill>
							Program counter
						</span>
						<span className="text-amber-500">
							{show(pc, format)}
						</span>
					</div>
					<div className={s.grid}>
						{Array.from(registers, (value, i) => {
							const isEditing = editing?.reg === i;
							return (
								<div
									key={ABI_NAMES[i]}
									className={twMerge(
										s.cell,
										i > 0 && s.editable,
										isEditing && s.editing,
										isEditing &&
											draft === null &&
											s.invalid,
										read.has(i) && s.read,
										written.has(i) && s.written,
									)}
									title={
										i === 0
											? "x0 is hard-wired to zero"
											: `x${i} = ${value | 0} (0x${hex32(value)}). Click to edit.`
									}
									onClick={() => open(i)}
								>
									<span className="flex flex-row items-center gap-[.35rem] text-neutral-500">
										<NamePill>{ABI_NAMES[i]}</NamePill>
										<span className="text-[.7rem] translate-y-[.04rem]">
											x{i}
										</span>
									</span>
									{isEditing ? (
										<input
											autoFocus
											spellCheck={false}
											aria-label={`New value for ${ABI_NAMES[i]}`}
											className={s.input}
											value={editing.text}
											onFocus={(e) =>
												e.currentTarget.select()
											}
											onChange={(e) =>
												setEditing({
													reg: i,
													text: e.target.value,
												})
											}
											onBlur={commit}
											onKeyDown={(e) => {
												if (e.key === "Enter") commit();
												if (e.key === "Escape")
													setEditing(null);
											}}
										/>
									) : (
										<span
											className={
												value
													? "text-black dark:text-white"
													: "text-neutral-400 dark:text-neutral-600"
											}
										>
											{show(value, format)}
										</span>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</PanelBase>
	);
}
