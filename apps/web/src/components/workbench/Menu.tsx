"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuChevronDown } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import s from "./Menu.module.scss";

type Props = {
	label: React.ReactNode;
	title?: string;
	align?: "left" | "right";
	/** Square icon trigger without the chevron, sized like the other icon plates. */
	icon?: boolean;
	/** Trigger size; "small" matches the plates in panel title bars. */
	size?: "default" | "small";
	panelClassName?: string;
	/** "dialog" when the panel holds controls rather than menu items. */
	panelRole?: "menu" | "dialog";
	/** Receives `close` so plain actions can dismiss the menu; toggles can keep it open. */
	children: (close: () => void) => React.ReactNode;
};

/** Pixels per rem, for turning the rem spacing below into viewport coordinates. */
function rem() {
	return (
		parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
	);
}

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Plate trigger with a popover list. The open panel is portalled to <body> with fixed
 * coordinates, so `overflow-hidden` ancestors (panels) can't clip it. It opens below the
 * trigger, flips above when only that fits, and otherwise takes the roomier side with a
 * capped, scrolling height. Closes on outside click or Escape.
 */
export default function ({
	label,
	title,
	align = "left",
	icon,
	size,
	panelClassName,
	panelRole = "menu",
	children,
}: Props) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const panel = useRef<HTMLDivElement>(null);

	const trigger = () => root.current?.querySelector("button");

	// Place the panel against the trigger, inside the viewport. Imperative so scroll and
	// resize don't re-render; runs before paint, so the first frame is already in place.
	useLayoutEffect(() => {
		if (!open) return;

		const place = () => {
			const el = panel.current;
			const anchor = root.current;
			if (!el || !anchor) return;

			const unit = rem();
			const gap = 0.5 * unit;
			const gutter = 0.5 * unit;
			const t = anchor.getBoundingClientRect();
			const vw = document.documentElement.clientWidth;
			const vh = window.innerHeight;

			// Natural size first: drop any cap from a previous placement.
			el.style.maxHeight = "";
			const width = el.offsetWidth;
			const height = el.offsetHeight;

			const below = vh - t.bottom - gap - gutter;
			const above = t.top - gap - gutter;
			const up = height > below && (height <= above || above > below);
			const room = Math.max(0, up ? above : below);

			el.dataset.side = up ? "top" : "bottom";
			el.style.maxHeight = height > room ? `${room}px` : "";
			el.style.top = up ? "" : `${t.bottom + gap}px`;
			el.style.bottom = up ? `${vh - t.top + gap}px` : "";

			const ideal = align === "right" ? t.right - width : t.left;
			const left = Math.max(gutter, Math.min(ideal, vw - gutter - width));
			el.style.left = `${left}px`;
		};

		place();
		window.addEventListener("resize", place);
		// Capture, so scrolling inside any container (a panel body) re-anchors too.
		window.addEventListener("scroll", place, true);
		return () => {
			window.removeEventListener("resize", place);
			window.removeEventListener("scroll", place, true);
		};
	}, [open, align]);

	useEffect(() => {
		if (!open) return;
		// The panel lives in a portal, so "inside" means the trigger wrapper or the panel.
		const onDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (root.current?.contains(target)) return;
			if (panel.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setOpen(false);
			if (panel.current?.contains(document.activeElement))
				trigger()?.focus();
		};
		window.addEventListener("pointerdown", onDown);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onDown);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	// The portal sits at the end of <body>, so bridge Tab order by hand: Tab from the
	// trigger enters the panel, Shift+Tab off its first control returns to the trigger,
	// and Tab off its last control closes the menu back onto the trigger.
	const focusables = () =>
		Array.from(
			panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
		);

	const onTriggerKey = (e: React.KeyboardEvent) => {
		if (!open || e.key !== "Tab" || e.shiftKey) return;
		// React bubbles portal events through here too; only the trigger counts.
		if (!root.current?.contains(e.target as Node)) return;
		const first = focusables()[0];
		if (!first) return;
		e.preventDefault();
		first.focus();
	};

	const onPanelKey = (e: React.KeyboardEvent) => {
		if (e.key !== "Tab") return;
		const items = focusables();
		const edge = e.shiftKey ? items[0] : items[items.length - 1];
		if (document.activeElement !== edge) return;
		e.preventDefault();
		if (!e.shiftKey) setOpen(false);
		trigger()?.focus();
	};

	return (
		<div ref={root} className="relative" onKeyDown={onTriggerKey}>
			<ButtonSecondary
				aria-expanded={open}
				aria-haspopup={panelRole}
				title={title}
				aria-label={icon ? title : undefined}
				icon={icon}
				size={size}
				onClick={() => setOpen((o) => !o)}
			>
				{label}
				{!icon && <LuChevronDown size={16} />}
			</ButtonSecondary>
			{open &&
				createPortal(
					<div
						ref={panel}
						role={panelRole}
						data-lenis-prevent
						onKeyDown={onPanelKey}
						className={twMerge(
							s.panel,
							"grid min-w-[14rem] p-[.35rem] rounded-[1rem] border-[1px] border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 border-b-[3px]",
							panelClassName,
						)}
					>
						{children(() => setOpen(false))}
					</div>,
					document.body,
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
