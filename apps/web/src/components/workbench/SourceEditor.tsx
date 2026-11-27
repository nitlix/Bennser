"use client";

import type { AssembleError } from "@bennser/asm/browser";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { tokenizeLine } from "./highlight";
import s from "./SourceEditor.module.scss";
import { useDragMove } from "./useDragMove";

type Props = {
	value: string;
	onChange: (value: string) => void;
	errors: AssembleError[];
	onSubmit: () => void;
	breakpoints: Set<number>;
	onToggleBreakpoint: (line: number) => void;
	/** Global breakpoint enable: when off, breakpoints stay shown but dimmed. */
	breakpointsEnabled: boolean;
	/** Source line of the next instruction to execute, when paused on up-to-date code. */
	pcLine: number | null;
	/** Code font size in rem. */
	fontSize: number;
};

export default function ({
	value,
	onChange,
	errors,
	onSubmit,
	breakpoints,
	onToggleBreakpoint,
	breakpointsEnabled,
	pcLine,
	fontSize,
}: Props) {
	const area = useRef<HTMLTextAreaElement>(null);
	const gutter = useRef<HTMLDivElement>(null);
	const bands = useRef<HTMLDivElement>(null);
	const code = useRef<HTMLPreElement>(null);
	const drag = useDragMove(area);
	const lines = useMemo(() => value.split("\n"), [value]);
	const lineCount = lines.length;
	const highlighted = useMemo(() => lines.map(tokenizeLine), [lines]);
	const errorLines = new Set(errors.map((e) => e.line));
	// The caret's line (VS Code's current-line highlight); null while text is selected.
	const [caretLine, setCaretLine] = useState<number | null>(null);

	function trackCaret(el: HTMLTextAreaElement) {
		const { selectionStart: start, selectionEnd: end } = el;
		if (start !== end) {
			setCaretLine(null);
			return;
		}
		setCaretLine(el.value.slice(0, start).split("\n").length);
	}

	// React's onSelect only fires on key-up/mouse-up, so the band lagged a held
	// arrow key. The native selectionchange fires on every caret move: on the
	// textarea in newer browsers, on the document in older ones.
	useEffect(() => {
		const el = area.current;
		if (!el) return;
		const onChange = () => {
			if (document.activeElement === el) trackCaret(el);
		};
		el.addEventListener("selectionchange", onChange);
		document.addEventListener("selectionchange", onChange);
		return () => {
			el.removeEventListener("selectionchange", onChange);
			document.removeEventListener("selectionchange", onChange);
		};
	}, []);

	function syncScroll(top: number, left = area.current?.scrollLeft ?? 0) {
		if (gutter.current) gutter.current.scrollTop = top;
		if (bands.current)
			bands.current.style.transform = `translateY(${-top}px)`;
		if (code.current)
			code.current.style.transform = `translate(${-left}px, ${-top}px)`;
	}

	// Keep the current line on screen while stepping.
	useEffect(() => {
		const el = area.current;
		if (!el || pcLine === null) return;
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
		const top = (pcLine - 1) * lineHeight;
		const visible =
			top >= el.scrollTop &&
			top + lineHeight * 2 <= el.scrollTop + el.clientHeight;
		if (visible) return;
		el.scrollTop = Math.max(0, top - el.clientHeight / 3);
		syncScroll(el.scrollTop);
	}, [pcLine, fontSize]);

	function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			onSubmit();
			return;
		}
		if (e.key !== "Tab") return;

		// Insert a real tab instead of moving focus.
		e.preventDefault();
		const el = e.currentTarget;
		const { selectionStart: start, selectionEnd: end } = el;
		onChange(`${value.slice(0, start)}\t${value.slice(end)}`);
		requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
	}

	function jumpTo(line: number, column: number) {
		const el = area.current;
		if (!el) return;
		const offset =
			value
				.split("\n")
				.slice(0, line - 1)
				.reduce((n, l) => n + l.length + 1, 0) + column;
		el.focus();
		el.setSelectionRange(offset, offset);
	}

	return (
		<>
			<div
				className={twMerge(
					s.editor,
					!breakpointsEnabled && s.breakpointsOff,
				)}
				style={{ "--font": `${fontSize}rem` } as React.CSSProperties}
			>
				<div
					className={s.gutter}
					ref={gutter}
					onWheel={(e) => {
						if (area.current) area.current.scrollTop += e.deltaY;
					}}
				>
					{Array.from({ length: lineCount }, (_, i) => {
						const line = i + 1;
						return (
							<button
								key={line}
								type="button"
								tabIndex={-1}
								onClick={() => onToggleBreakpoint(line)}
								className={twMerge(
									s.line,
									breakpoints.has(line) && s.breakpoint,
									errorLines.has(line) && s.error,
									caretLine === line && s.active,
									pcLine === line && s.current,
								)}
								aria-label={`Toggle breakpoint on line ${line}`}
							>
								<span className={s.dot} />
								{line}
							</button>
						);
					})}
				</div>

				<div className={s.body}>
					<div className={s.bands} ref={bands} aria-hidden>
						{caretLine !== null && (
							<div
								className={s.caretBand}
								style={{
									top: `calc(${caretLine - 1} * var(--line))`,
								}}
							/>
						)}
						{[...errorLines].map((line) => (
							<div
								key={`e${line}`}
								className={s.errorBand}
								style={{
									top: `calc(${line - 1} * var(--line))`,
								}}
							/>
						))}
						{[...breakpoints].map((line) => (
							<div
								key={`b${line}`}
								className={s.breakpointBand}
								style={{
									top: `calc(${line - 1} * var(--line))`,
								}}
							/>
						))}
						{pcLine !== null && (
							<div
								className={s.pcBand}
								style={{
									top: `calc(${pcLine - 1} * var(--line))`,
								}}
							/>
						)}
					</div>
					<pre className={s.code} ref={code} aria-hidden>
						{highlighted.map((tokens, i) => (
							<Fragment key={i}>
								{tokens.map((t, j) =>
									t.kind ? (
										<span key={j} className={s[t.kind]}>
											{t.text}
										</span>
									) : (
										t.text
									),
								)}
								{"\n"}
							</Fragment>
						))}
					</pre>
					<textarea
						ref={area}
						className={s.area}
						value={value}
						spellCheck={false}
						onChange={(e) => onChange(e.target.value)}
						onKeyDown={onKeyDown}
						onSelect={(e) => trackCaret(e.currentTarget)}
						onInput={(e) => trackCaret(e.currentTarget)}
						onMouseDown={drag.onMouseDown}
						onMouseMove={drag.onMouseMove}
						onScroll={(e) =>
							syncScroll(
								e.currentTarget.scrollTop,
								e.currentTarget.scrollLeft,
							)
						}
						placeholder="; write Manchester RISC-V here, then hit Run (⌘↵)"
						data-lenis-prevent
					/>
					{drag.caret && (
						<div
							className={s.dropCaret}
							style={{
								left: drag.caret.left,
								top: drag.caret.top,
								height: drag.caret.height,
							}}
						/>
					)}
				</div>
			</div>

			{errors.length > 0 && (
				<div className={s.errors} data-lenis-prevent>
					{errors.map((e) => (
						<button
							key={`${e.line}:${e.column}:${e.message}`}
							type="button"
							onClick={() => jumpTo(e.line, e.column)}
						>
							<span className="font-mono text-rose-500 shrink-0">
								{e.line}:{e.column + 1}
							</span>
							<span className="text-black dark:text-white">
								{e.message}
							</span>
							{/\d\s*\(\s*\w+\s*\)/.test(e.source) && (
								<span className="text-neutral-500">
									Bennett uses brackets here, like 4[a1]
								</span>
							)}
						</button>
					))}
				</div>
			)}
		</>
	);
}
