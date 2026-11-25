"use client";

import { ABI_NAMES, hex32, type StepTrace } from "@bennser/core";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import PanelBase from "@/components/PanelBase";
import PillBase from "@/components/PillBase";
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
const NamePill = ({ children }: { children: React.ReactNode }) => (
	<PillBase className="h-[1.3rem] px-[.4rem] rounded-[.35rem] border-0 bg-neutral-500 dark:bg-neutral-800 text-white dark:text-white font-sans text-[.8rem] font-[500]">
		{children}
	</PillBase>
);

type Props = { registers: Uint32Array; pc: number; trace: StepTrace | null };

export default function ({ registers, pc, trace }: Props) {
	const [format, setFormat] = useStored<Format>(
		"bennser:registerFormat",
		"hex",
		(v) => FORMATS.some((f) => f.id === v),
	);
	const written = new Set(trace?.regWrites.map((w) => w.reg));
	const read = new Set(trace?.regReads.map((r) => r.reg));

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
					<span className="@[27rem]/registers:hidden">{f.short}</span>
					<span className="hidden @[27rem]/registers:inline">
						{f.full}
					</span>
				</ButtonSecondary>
			))}
		</div>
	);

	return (
		<PanelBase
			title="Registers"
			actions={actions}
			className="@container/registers"
		>
			<div className="flex-1 min-h-0 overflow-auto" data-lenis-prevent>
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
						{Array.from(registers, (value, i) => (
							<div
								key={ABI_NAMES[i]}
								className={twMerge(
									s.cell,
									read.has(i) && s.read,
									written.has(i) && s.written,
								)}
								title={`x${i} = ${value | 0} (0x${hex32(value)})`}
							>
								<span className="flex flex-row items-center gap-[.35rem] text-neutral-500">
									<NamePill>{ABI_NAMES[i]}</NamePill>
									<span className="text-[.7rem] translate-y-[.04rem]">
										x{i}
									</span>
								</span>
								<span
									className={
										value
											? "text-black dark:text-white"
											: "text-neutral-400 dark:text-neutral-600"
									}
								>
									{show(value, format)}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</PanelBase>
	);
}
