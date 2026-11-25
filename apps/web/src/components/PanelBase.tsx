"use client";

import { useContext } from "react";
import { LuGripVertical, LuX } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import { DockCellContext } from "@/components/workbench/Dock";

type Props = React.JSX.IntrinsicElements["section"] & {
	title: React.ReactNode;
	/** Sits right after the title, outside the drag handle (so inputs work). */
	badge?: React.ReactNode;
	actions?: React.ReactNode;
};

/**
 * Bordered workbench panel with a title bar; the body scrolls on its own.
 * Inside the Dock the title doubles as a drag handle and a hide button appears.
 */
export default function ({
	title,
	badge,
	actions,
	className,
	children,
	...props
}: Props) {
	const dock = useContext(DockCellContext);

	return (
		<section
			className={twMerge(
				"group/panel flex flex-col min-h-0 min-w-0 border-[1px] border-neutral-200 dark:border-neutral-800 rounded-[1rem] bg-white dark:bg-black overflow-hidden",
				className,
			)}
			{...props}
		>
			<header className="flex flex-row items-center justify-between gap-[.5rem] pl-[.5rem] pr-[.6rem] h-[2.75rem] shrink-0 border-b-[1px] border-neutral-200 dark:border-neutral-800">
				<div className="flex flex-row items-center gap-[.6rem] min-w-0">
					<h2
						className="flex flex-row items-center gap-[.35rem] shrink-0 text-[.875rem] font-[600] tracking-normal text-black dark:text-white cursor-grab active:cursor-grabbing select-none"
						title={dock ? "Drag to move" : undefined}
						{...dock?.handle}
					>
						<LuGripVertical
							size={16}
							className="shrink-0 text-neutral-300 dark:text-neutral-700 group-hover/panel:text-neutral-500"
						/>
						{title}
					</h2>
					{badge}
				</div>
				<div className="flex flex-row items-center gap-[.5rem] min-w-0">
					{actions}
					{dock && (
						<button
							type="button"
							onClick={dock.hide}
							className="grid place-items-center shrink-0 size-[1.75rem] rounded-[.5rem] text-neutral-400 opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-black dark:hover:text-white"
							aria-label="Hide panel"
							title="Hide panel"
						>
							<LuX size={16} />
						</button>
					)}
				</div>
			</header>
			{children}
		</section>
	);
}
