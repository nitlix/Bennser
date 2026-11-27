"use client";

import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import PanelBase from "@/components/PanelBase";
import s from "./Console.module.scss";

type Props = {
	output: number[];
	pendingInput: number;
	waiting: boolean;
	enabled: boolean;
	onInput: (bytes: Uint8Array) => void;
	footer?: React.ReactNode;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Bennett's key map (`TerminalTextEdit.cpp` `resolveKeyPress`). Delete is ignored there too. */
const KEYS: Record<string, number | null> = {
	Enter: 0x0a,
	Backspace: 0x08,
	Tab: 0x09,
	ArrowUp: 0x80,
	ArrowDown: 0x81,
	ArrowLeft: 0x82,
	ArrowRight: 0x83,
	Delete: null,
};

/**
 * Raw terminal, like Bennett's: every key goes to the program the moment it's
 * pressed (no line buffering, no echo), and the output ends in a block cursor.
 * A hidden textarea takes the keys so mobile keyboards and IMEs still work.
 */
export default function ({
	output,
	pendingInput,
	waiting,
	enabled,
	onInput,
	footer,
}: Props) {
	const [focused, setFocused] = useState(false);
	const scroller = useRef<HTMLPreElement>(null);
	const field = useRef<HTMLTextAreaElement>(null);
	const text = decoder.decode(Uint8Array.from(output));

	useEffect(() => {
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [text, focused]);

	useEffect(() => {
		if (waiting) field.current?.focus({ preventScroll: true });
	}, [waiting]);

	function send(value: string | number) {
		if (!enabled) return;
		onInput(
			typeof value === "number"
				? Uint8Array.of(value)
				: encoder.encode(value),
		);
	}

	function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey) return;
		if (e.key === "Escape") {
			e.currentTarget.blur();
			return;
		}
		if (e.key in KEYS) {
			e.preventDefault();
			const byte = KEYS[e.key];
			if (byte != null) send(byte);
			return;
		}
		if (e.key.length !== 1 && [...e.key].length !== 1) return;
		e.preventDefault();
		send(e.key);
	}

	// Anything that still lands in the textarea (mobile keyboards, IME) is sent and cleared.
	function flush(el: HTMLTextAreaElement) {
		if (el.value) send(el.value);
		el.value = "";
	}

	function onPaste(e: React.ClipboardEvent) {
		e.preventDefault();
		send(e.clipboardData.getData("text").replace(/\r\n?/g, "\n"));
	}

	// Click to focus, but leave a text selection alone so output can be copied.
	function focusField() {
		if (window.getSelection()?.isCollapsed === false) return;
		field.current?.focus({ preventScroll: true });
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
				onMouseUp={focusField}
				className="relative flex-1 min-h-0 overflow-auto px-[.85rem] py-[.6rem] font-mono text-[.875rem] leading-[1.4rem] whitespace-pre-wrap break-all text-black dark:text-white cursor-text"
				data-lenis-prevent
			>
				{text}
				<span
					className={twMerge(
						s.cursor,
						focused && enabled && s.focused,
						waiting && s.waiting,
					)}
				/>
				{!text && !focused && (
					<span className="text-neutral-400 dark:text-neutral-600">
						{" "}
						Click here and type: keys go straight to the program.
					</span>
				)}
				<textarea
					ref={field}
					disabled={!enabled}
					onKeyDown={onKeyDown}
					onInput={(e) =>
						!(e.nativeEvent as InputEvent).isComposing &&
						flush(e.currentTarget)
					}
					onCompositionEnd={(e) => flush(e.currentTarget)}
					onPaste={onPaste}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					autoCapitalize="off"
					autoComplete="off"
					autoCorrect="off"
					spellCheck={false}
					aria-label="Program input: keys are sent as you press them"
					className="absolute bottom-0 left-0 size-[.0625rem] opacity-0 resize-none text-[1rem] pointer-events-none"
				/>
			</pre>
			{footer}
		</PanelBase>
	);
}
