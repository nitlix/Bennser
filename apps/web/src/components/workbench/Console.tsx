"use client";

import { useEffect, useRef, useState } from "react";
import { LuChevronRight, LuCornerDownLeft } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import PanelBase from "@/components/PanelBase";

type Props = {
	output: number[];
	pendingInput: number;
	waiting: boolean;
	enabled: boolean;
	onInput: (text: string) => void;
	footer?: React.ReactNode;
};

const decoder = new TextDecoder();

/** Program output (ecall 0/2/3) and input for ecall 1. */
export default function ({
	output,
	pendingInput,
	waiting,
	enabled,
	onInput,
	footer,
}: Props) {
	const [line, setLine] = useState("");
	const scroller = useRef<HTMLPreElement>(null);
	const field = useRef<HTMLInputElement>(null);
	const text = decoder.decode(Uint8Array.from(output));

	useEffect(() => {
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [text]);

	useEffect(() => {
		if (waiting) field.current?.focus();
	}, [waiting]);

	function submit(e: React.FormEvent) {
		e.preventDefault();
		onInput(`${line}\n`);
		setLine("");
	}

	return (
		<PanelBase
			title="Console"
			actions={
				pendingInput > 0 && (
					<span className="text-[.8rem] text-neutral-500">
						{pendingInput} bytes queued
					</span>
				)
			}
		>
			<pre
				ref={scroller}
				className="flex-1 min-h-0 overflow-auto px-[.85rem] py-[.6rem] font-mono text-[.875rem] leading-[1.4rem] whitespace-pre-wrap break-all text-black dark:text-white"
				data-lenis-prevent
			>
				{text || (
					<span className="text-neutral-400 dark:text-neutral-600">
						Anything the program prints shows up here.
					</span>
				)}
			</pre>
			{footer}
			<form
				onSubmit={submit}
				className="flex flex-row items-center gap-[.6rem] px-[1rem] h-[3rem] shrink-0 border-t-[1px] border-neutral-200 dark:border-neutral-800"
			>
				<LuChevronRight
					size={16}
					className={twMerge(
						"shrink-0",
						waiting
							? "text-amber-500 animate-pulse"
							: "text-neutral-400",
					)}
				/>
				<input
					ref={field}
					value={line}
					disabled={!enabled}
					onChange={(e) => setLine(e.target.value)}
					placeholder={
						waiting
							? "The program is waiting for input…"
							: "Type input for the program, Enter to send"
					}
					className="flex-1 min-w-0 h-full bg-transparent font-mono text-[1rem] md:text-[.875rem] leading-none text-black dark:text-white shadow-none outline-none focus:outline-none"
				/>
				<button
					type="submit"
					disabled={!enabled}
					className="grid place-items-center shrink-0 size-[1.75rem] rounded-[.5rem] text-neutral-500 hover:text-black dark:hover:text-white"
					aria-label="Send input"
				>
					<LuCornerDownLeft size={16} />
				</button>
			</form>
		</PanelBase>
	);
}
