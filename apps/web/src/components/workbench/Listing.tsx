"use client";

import { hex32, type Kmd } from "@bennser/core";
import { useEffect, useRef } from "react";
import { twMerge } from "tailwind-merge";

type Props = {
	kmd: Kmd;
	pc: number;
	/** Resolved breakpoint addresses. */
	breakpoints: number[];
	/** Toggles by source line, so the editor and this listing share one set. */
	onToggleBreakpoint: (sourceLine: number) => void;
	/** Addresses touched by the last memory access, to flash data rows. */
	touched: Set<number>;
};

const hexBytes = (bytes: number[], chunk: number) => {
	const parts: string[] = [];
	for (let i = 0; i < bytes.length; i += chunk) {
		let value = 0;
		for (let b = chunk - 1; b >= 0; b--)
			value = value * 256 + (bytes[i + b] ?? 0);
		parts.push(
			value
				.toString(16)
				.toUpperCase()
				.padStart(chunk * 2, "0"),
		);
	}
	return parts.join(" ");
};

/** Assembled program: one row per KMD line, current instruction highlighted. */
export default function ({
	kmd,
	pc,
	breakpoints,
	onToggleBreakpoint,
	touched,
}: Props) {
	const current = useRef<HTMLDivElement>(null);

	useEffect(() => {
		current.current?.scrollIntoView({ block: "nearest" });
	}, [pc]);

	const bps = new Set(breakpoints);
	const rows = kmd.lines.filter((l) => l.bytes.length || l.source.trim());

	return (
		<div
			className="flex-1 min-h-0 overflow-auto font-mono text-[.875rem] leading-[1.5rem] py-[.5rem]"
			data-lenis-prevent
		>
			{rows.map((line, i) => {
				const isCode = line.chunk === 4 && !line.data;
				const isPc = isCode && line.address === pc;
				const hasBp = isCode && bps.has(line.address);
				const isTouched = line.bytes.some((_, b) =>
					touched.has(line.address + b),
				);
				// Continuation rows (2nd word of `li`/`la`) repeat the source; show it once.
				const repeat =
					i > 0 &&
					rows[i - 1]!.source === line.source &&
					line.bytes.length > 0;

				return (
					<div
						key={`${line.index}`}
						ref={isPc ? current : undefined}
						className={twMerge(
							"flex flex-row items-center gap-[.75rem] pr-[1rem] whitespace-pre",
							isPc &&
								"bg-amber-500/20 shadow-[inset_3px_0_0_var(--color-amber-500)]",
							isTouched && !isPc && "bg-sky-500/10",
						)}
					>
						<button
							type="button"
							disabled={!isCode}
							onClick={() => onToggleBreakpoint(line.sourceLine)}
							className="grid place-items-center shrink-0 w-[1.75rem] h-[1.5rem] group disabled:cursor-default"
							aria-label={`Toggle breakpoint at ${hex32(line.address)}`}
						>
							<span
								className={twMerge(
									"size-[.6rem] rounded-full",
									hasBp
										? "bg-rose-500 shadow-[0_.1rem_0_var(--color-rose-700)]"
										: isCode
											? "group-hover:bg-rose-500/40"
											: "",
								)}
							/>
						</button>
						<span className="text-neutral-400 dark:text-neutral-600 shrink-0">
							{hex32(line.address)}
						</span>
						<span className="text-neutral-500 w-[6.5rem] shrink-0 overflow-hidden">
							{hexBytes(line.bytes, line.chunk || 1)}
						</span>
						<span
							className={twMerge(
								"text-black dark:text-white",
								repeat &&
									"text-neutral-400 dark:text-neutral-600",
							)}
						>
							{repeat ? "  ↳" : line.source}
						</span>
					</div>
				);
			})}
		</div>
	);
}
