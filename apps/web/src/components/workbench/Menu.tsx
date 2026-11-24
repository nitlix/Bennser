"use client";

import { useEffect, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import s from "./Menu.module.scss";

type Props = {
	label: React.ReactNode;
	title?: string;
	align?: "left" | "right";
	/** Receives `close` so plain actions can dismiss the menu; toggles can keep it open. */
	children: (close: () => void) => React.ReactNode;
};

/** Plate trigger with a popover list. Closes on outside click or Escape. */
export default function ({ label, title, align = "left", children }: Props) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("pointerdown", onDown);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onDown);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div ref={root} className="relative">
			<ButtonSecondary
				aria-expanded={open}
				aria-haspopup="menu"
				title={title}
				onClick={() => setOpen((o) => !o)}
			>
				{label}
				<LuChevronDown size={16} />
			</ButtonSecondary>
			{open && (
				<div
					role="menu"
					className={twMerge(
						s.panel,
						"absolute top-[calc(100%+.5rem)] z-[60] grid min-w-[14rem] p-[.35rem] rounded-[1rem] border-[1px] border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 border-b-[3px]",
						align === "right" ? "right-0" : "left-0",
					)}
				>
					{children(() => setOpen(false))}
				</div>
			)}
		</div>
	);
}

export function MenuItem({
	className,
	children,
	...props
}: React.JSX.IntrinsicElements["button"]) {
	return (
		<button
			type="button"
			role="menuitem"
			className={twMerge(
				"flex flex-row items-center gap-[.6rem] w-full min-h-[2.5rem] px-[.75rem] rounded-[.65rem] text-left text-[.875rem] font-[500] text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
