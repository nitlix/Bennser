"use client";

import { ABI_NAMES, hex32, type StepTrace } from "@bennser/core";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import PanelBase from "@/components/PanelBase";

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

type Props = { registers: Uint32Array; pc: number; trace: StepTrace | null };

export default function ({ registers, pc, trace }: Props) {
	const [format, setFormat] = useState<Format>("hex");
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
			{/* The gap puts the divider exactly midway between pc and the register grid. */}
			<div
				className="flex flex-col gap-[.65rem] px-[.85rem] py-[.65rem] font-mono text-[.875rem] overflow-auto"
				data-lenis-prevent
			>
				<div className="flex flex-row justify-between items-center h-[1.6rem] shrink-0">
					<span className="text-neutral-500">pc</span>
					<span className="text-amber-500">{hex32(pc)}</span>
				</div>
				<hr className="shrink-0 h-[1px] border-0 bg-neutral-200 dark:bg-neutral-800" />
				<div className="grid grid-cols-2 grid-rows-[repeat(16,1.6rem)] grid-flow-col gap-x-[1rem]">
					{Array.from(registers, (value, i) => (
						<div
							key={ABI_NAMES[i]}
							className={twMerge(
								"flex flex-row justify-between items-center h-[1.6rem] px-[.35rem] -mx-[.35rem] rounded-[.3rem] transition-colors",
								read.has(i) && "bg-sky-500/15",
								written.has(i) && "bg-amber-500/20",
							)}
							title={`x${i} = ${value | 0} (0x${hex32(value)})`}
						>
							<span className="text-neutral-500">
								<span className="text-black dark:text-white">
									{ABI_NAMES[i]}
								</span>
								<span className="text-[.7rem]"> x{i}</span>
							</span>
							<span
								className={twMerge(
									value
										? "text-black dark:text-white"
										: "text-neutral-400 dark:text-neutral-600",
								)}
							>
								{show(value, format)}
							</span>
						</div>
					))}
				</div>
			</div>
		</PanelBase>
	);
}
