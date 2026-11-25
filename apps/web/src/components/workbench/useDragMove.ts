"use client";

import { useEffect, useRef, useState } from "react";

/** Where the drop caret is drawn, in px from the textarea's top-left (scroll applied). */
export type DropCaret = { left: number; top: number; height: number };

const TAB = 8; // Must match the editor's tab-size.
const THRESHOLD = 4; // px of movement before a press on the selection becomes a drag.

type Metrics = {
	rect: DOMRect;
	padTop: number;
	padLeft: number;
	line: number;
	char: number;
};

function metrics(el: HTMLTextAreaElement): Metrics {
	const style = getComputedStyle(el);
	const ctx = document.createElement("canvas").getContext("2d")!;
	ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	return {
		rect: el.getBoundingClientRect(),
		padTop: parseFloat(style.paddingTop),
		padLeft: parseFloat(style.paddingLeft),
		line: parseFloat(style.lineHeight),
		char: ctx.measureText("0").width,
	};
}

/** Visual column (tabs expanded) of each character boundary in a line. */
function columns(line: string) {
	const cols = [0];
	let col = 0;
	for (const ch of line) {
		col = ch === "\t" ? (Math.floor(col / TAB) + 1) * TAB : col + 1;
		cols.push(col);
	}
	return cols;
}

/**
 * Text offset under a point. `inside` is the character the point is over (for hit-testing
 * the selection); `caret` is the nearest boundary between characters (for dropping).
 */
function hit(el: HTMLTextAreaElement, m: Metrics, x: number, y: number) {
	const lines = el.value.split("\n");
	const row = Math.max(
		0,
		Math.min(
			lines.length - 1,
			Math.floor((y - m.rect.top - m.padTop + el.scrollTop) / m.line),
		),
	);
	const col = (x - m.rect.left - m.padLeft + el.scrollLeft) / m.char;
	const cols = columns(lines[row]!);

	let caret = cols.length - 1;
	for (let i = 0; i < cols.length - 1; i++) {
		if (col < (cols[i]! + cols[i + 1]!) / 2) {
			caret = i;
			break;
		}
	}
	let inside = -1;
	for (let i = 0; i < cols.length - 1; i++) {
		if (col >= cols[i]! && col < cols[i + 1]!) inside = i;
	}

	const start = lines.slice(0, row).reduce((n, l) => n + l.length + 1, 0);
	return {
		caret: start + caret,
		inside: inside < 0 ? -1 : start + inside,
		row,
		col: cols[caret]!,
	};
}

/** Replace a range through the editing commands, so the browser's undo still works. */
function replace(
	el: HTMLTextAreaElement,
	from: number,
	to: number,
	text: string,
) {
	el.setSelectionRange(from, to);
	const ok = text
		? document.execCommand("insertText", false, text)
		: document.execCommand("delete");
	if (ok) return;
	// Fallback: set the value directly and let React hear about it.
	el.setRangeText(text, from, to, "end");
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * VS Code-style drag and drop of selected text inside the source textarea: press on the
 * selection, drag, and a drop caret follows the pointer; release to move the text there
 * (hold Alt/Option to copy instead). A press that doesn't move just places the caret, and
 * Escape cancels. Edits go through execCommand so ⌘Z undoes them.
 */
export function useDragMove(area: React.RefObject<HTMLTextAreaElement | null>) {
	const [caret, setCaret] = useState<DropCaret | null>(null);
	const cleanup = useRef<(() => void) | null>(null);

	useEffect(() => () => cleanup.current?.(), []);

	function overSelection(el: HTMLTextAreaElement, x: number, y: number) {
		const { selectionStart: start, selectionEnd: end } = el;
		if (start === end) return false;
		const { inside } = hit(el, metrics(el), x, y);
		return inside >= start && inside < end;
	}

	function onMouseMove(e: React.MouseEvent<HTMLTextAreaElement>) {
		if (cleanup.current || e.buttons) return;
		const el = e.currentTarget;
		// Arrow over the selection, like VS Code, to hint that it can be dragged.
		el.style.cursor = overSelection(el, e.clientX, e.clientY)
			? "default"
			: "";
	}

	function onMouseDown(e: React.MouseEvent<HTMLTextAreaElement>) {
		const el = e.currentTarget;
		const plain = !e.shiftKey && !e.metaKey && !e.ctrlKey;
		if (e.button !== 0 || e.detail > 1 || !plain) return;
		if (!overSelection(el, e.clientX, e.clientY)) return;

		// Ours from here: no native drag, and the selection stays put.
		e.preventDefault();
		el.focus();
		const from = el.selectionStart;
		const to = el.selectionEnd;
		const origin = { x: e.clientX, y: e.clientY };
		let dragging = false;
		let drop = from;

		const move = (ev: PointerEvent) => {
			if (
				!dragging &&
				Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) <
					THRESHOLD
			)
				return;
			dragging = true;
			const m = metrics(el);
			// Scroll when dragging past the top or bottom edge.
			if (ev.clientY < m.rect.top + m.line) el.scrollTop -= m.line;
			if (ev.clientY > m.rect.bottom - m.line) el.scrollTop += m.line;
			const h = hit(el, m, ev.clientX, ev.clientY);
			drop = h.caret;
			setCaret({
				left: m.padLeft + h.col * m.char - el.scrollLeft,
				top: m.padTop + h.row * m.line - el.scrollTop,
				height: m.line,
			});
		};

		const up = (ev: PointerEvent) => {
			const copy = ev.altKey;
			finish();
			if (!dragging) {
				// A plain click on the selection: put the caret there, as a textarea would.
				const at = hit(el, metrics(el), ev.clientX, ev.clientY).caret;
				el.setSelectionRange(at, at);
				return;
			}
			const inside = drop > from && drop < to;
			if (inside || (!copy && (drop === from || drop === to))) {
				el.setSelectionRange(from, to);
				return;
			}
			const text = el.value.slice(from, to);
			if (copy) {
				replace(el, drop, drop, text);
				el.setSelectionRange(drop, drop + text.length);
				return;
			}
			// Remove first, then insert at the drop point shifted for the removal.
			replace(el, from, to, "");
			const at = drop > to ? drop - text.length : drop;
			replace(el, at, at, text);
			el.setSelectionRange(at, at + text.length);
		};

		const key = (ev: KeyboardEvent) => {
			if (ev.key !== "Escape") return;
			ev.preventDefault();
			dragging = false;
			finish();
			el.setSelectionRange(from, to);
		};

		const finish = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("keydown", key, true);
			cleanup.current = null;
			setCaret(null);
			el.style.cursor = "";
		};

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("keydown", key, true);
		cleanup.current = finish;
		el.style.cursor = "default";
	}

	return { caret, onMouseDown, onMouseMove };
}
