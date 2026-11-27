"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import PanelBase from "@/components/PanelBase";
import Console from "./Console";
import Csrs from "./Csrs";
import Datapath from "./Datapath";
import Dock from "./Dock";
import FontSizeSlider, { FONT_SIZES } from "./FontSizeSlider";
import { EXAMPLES } from "./examples";
import FileMenu from "./FileMenu";
import Listing from "./Listing";
import MemoryView from "./MemoryView";
import Registers from "./Registers";
import SourceEditor from "./SourceEditor";
import Toolbar from "./Toolbar";
import { LuUpload } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import { useFileDrop } from "./useFileDrop";
import { DEFAULT_NAME, MAX_IMPORT, normaliseName, useFiles } from "./useFiles";
import { type PanelId, useLayout } from "./useLayout";
import { useMachine } from "./useMachine";
import { useStored } from "./useStored";

const SOURCE_KEY = "bennser:source";
const BREAKPOINTS_KEY = "bennser:breakpoints";

const isTyping = (el: EventTarget | null) =>
	el instanceof HTMLElement &&
	(el.tagName === "TEXTAREA" ||
		el.tagName === "INPUT" ||
		el.tagName === "SELECT");

export default function () {
	const api = useMachine(EXAMPLES[0]!.source);
	const layout = useLayout();
	const files = useFiles(api.source);
	const { machine, lastTrace } = api;
	const kmd = machine.kmd;
	const [fontSize, setFontSize] = useStored(
		"bennser:fontSize",
		0.875,
		(v) =>
			typeof v === "number" && v >= FONT_SIZES.min && v <= FONT_SIZES.max,
	);

	// Restore / persist the user's program and breakpoints.
	useEffect(() => {
		const saved = localStorage.getItem(SOURCE_KEY);
		if (!saved) return;
		let lines: number[] = [];
		try {
			lines = JSON.parse(localStorage.getItem(BREAKPOINTS_KEY) ?? "[]");
		} catch {}
		api.replaceSource(saved, lines);
	}, []);
	useEffect(() => localStorage.setItem(SOURCE_KEY, api.source), [api.source]);
	useEffect(
		() =>
			localStorage.setItem(
				BREAKPOINTS_KEY,
				JSON.stringify([...api.breakpoints]),
			),
		[api.breakpoints],
	);

	/** Bumped on each successful save so the file pill flashes "Saved". */
	const [saveCount, setSaveCount] = useState(0);
	function save() {
		const error = files.save();
		if (error) return alert(error);
		setSaveCount((n) => n + 1);
	}
	// The key handler is bound once per run state; always save the latest source.
	const saveRef = useRef(save);
	saveRef.current = save;

	/** Whether opening `name` may go ahead: nothing unsaved, or the user says drop it. */
	function mayDiscard(name: string) {
		return (
			!files.dirty ||
			confirm(
				`${files.name} has unsaved changes. Open ${name} anyway and lose them?`,
			)
		);
	}

	function show(name: string, text: string, input?: string) {
		files.opened(name, text);
		api.replaceSource(text);
		api.load(text, input);
	}

	/** Open a program (save, import, example), checking before dropping unsaved work. */
	function open(name: string, text: string, input?: string) {
		if (mayDiscard(name)) show(name, text, input);
	}

	/**
	 * Import files (Import file… or a drop): the first opens, the rest are saved to the
	 * browser. A drop (`autosave`) saves unsaved work first instead of asking.
	 */
	async function importFiles(list: File[], autosave: boolean) {
		const skipped: string[] = [];
		const read = await Promise.all(
			list.map(async (file) => {
				if (file.size > MAX_IMPORT) return null;
				// Folders and unreadable files reject; NULs mean binary.
				const text = await file.text().catch(() => null);
				if (text === null || text.includes("\u0000")) return null;
				return { name: normaliseName(file.name) ?? DEFAULT_NAME, text };
			}),
		);
		const texts = read.filter((t, i) => {
			if (!t) skipped.push(list[i]!.name);
			return t !== null;
		}) as { name: string; text: string }[];
		const [first, ...rest] = texts;
		const notes = skipped.length
			? [`Skipped (not an assembly text file): ${skipped.join(", ")}`]
			: [];
		if (!first) return alert(notes.join("\n"));

		if (autosave && files.dirty) {
			const error = files.save();
			if (error) return alert(error);
			setSaveCount((n) => n + 1);
		} else if (!autosave && !mayDiscard(first.name)) {
			return;
		}

		const full = rest.filter(
			(f) => files.store(f.name, f.text, first.name) === null,
		);
		show(first.name, first.text);
		if (rest.length > full.length) setSaveCount((n) => n + 1);
		if (full.length)
			notes.push(
				`Browser storage is full, so these weren't saved: ${full.map((f) => f.name).join(", ")}`,
			);
		if (notes.length) alert(notes.join("\n"));
	}

	const dropping = useFileDrop((list) => importFiles(list, true));

	// ⌘S / Ctrl+S save and ⌘↵ run anywhere; outside text fields: → step, ← back, space run/pause.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
				e.preventDefault();
				saveRef.current();
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				api.running === "fast" ? api.pause() : api.run();
				return;
			}
			if (isTyping(e.target)) return;
			const actions: Record<string, () => void> = {
				ArrowRight: api.step,
				ArrowLeft: api.back,
				" ": api.running ? api.pause : api.run,
			};
			const action = actions[e.key];
			if (!action) return;
			e.preventDefault();
			action();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [api.running, api.step, api.back, api.run, api.pause]);

	const home = useMemo(
		() => kmd?.lines.find((l) => l.data && l.bytes.length)?.address ?? 0,
		[kmd],
	);
	const touched = new Set(
		(lastTrace?.mem ?? []).flatMap((m) =>
			Array.from({ length: [1, 2, 4][m.size]! }, (_, i) => m.address + i),
		),
	);

	const panels: Record<PanelId, () => React.ReactNode> = {
		source: () => (
			<PanelBase
				title="Source"
				badge={
					<FileMenu
						files={files}
						source={api.source}
						onSave={save}
						onOpen={open}
						onImport={(list) => importFiles(list, false)}
						saveCount={saveCount}
					/>
				}
				actions={
					<>
						{api.breakpoints.size > 0 && (
							<ButtonSecondary
								size="small"
								aria-pressed={api.breakpointsEnabled}
								onClick={() =>
									api.setBreakpointsEnabled(
										!api.breakpointsEnabled,
									)
								}
								title={
									api.breakpointsEnabled
										? "Breakpoints are on: runs and multisteps stop at them. Click to turn all off."
										: "Breakpoints are off: runs ignore them. Click to turn them back on."
								}
							>
								Breakpoints
							</ButtonSecondary>
						)}
						<FontSizeSlider
							value={fontSize}
							onChange={setFontSize}
						/>
					</>
				}
			>
				<SourceEditor
					value={api.source}
					onChange={api.setSource}
					errors={api.errors}
					onSubmit={api.run}
					breakpoints={api.breakpoints}
					onToggleBreakpoint={api.toggleBreakpoint}
					breakpointsEnabled={api.breakpointsEnabled}
					pcLine={api.pcLine}
					fontSize={fontSize}
				/>
			</PanelBase>
		),
		code: () => (
			<PanelBase title="Machine code">
				{kmd && !api.stale ? (
					<Listing
						kmd={kmd}
						pc={machine.cpu.pc}
						breakpoints={api.breakpointAddresses}
						breakpointsEnabled={api.breakpointsEnabled}
						onToggleBreakpoint={api.toggleBreakpoint}
						touched={touched}
					/>
				) : (
					<p className="p-[1rem] text-[.875rem] leading-relaxed">
						Run or step the program to see what it assembles to.
					</p>
				)}
			</PanelBase>
		),
		datapath: () => <Datapath trace={lastTrace} />,
		console: () => (
			<Console
				output={machine.output}
				pendingInput={machine.cpu.fifoIn.length}
				waiting={api.reason === "waiting-input"}
				enabled={api.loaded}
				onInput={api.sendInput}
			/>
		),
		registers: () => (
			<Registers
				registers={machine.cpu.registers}
				pc={machine.cpu.pc}
				trace={lastTrace}
				onEdit={api.setReg}
				onZero={api.zeroRegs}
			/>
		),
		csrs: () => <Csrs csr={machine.cpu.csr} trace={lastTrace} />,
		memory: () => (
			<MemoryView
				memory={machine.cpu.memory}
				kmd={kmd}
				access={lastTrace?.mem ?? []}
				home={home}
				pc={machine.cpu.pc}
				registers={machine.cpu.registers}
				onEdit={api.setMem}
				onEditWord={api.setWord}
			/>
		),
	};

	return (
		<div
			// p-0 beats the template's `._nitlix > *` page padding (--spacing).
			className={twMerge(
				"flex flex-col w-full h-dvh p-0 bg-neutral-50 dark:bg-neutral-950 overflow-auto lg:overflow-hidden",
				layout.floating && "gap-[.75rem] p-[.75rem]",
			)}
		>
			<Toolbar api={api} layout={layout} />
			<Dock layout={layout} render={(id) => panels[id]()} />
			{dropping && (
				<div className="fixed inset-[.75rem] z-[90] flex flex-col items-center justify-center gap-[.5rem] rounded-[1rem] border-[1px] border-dashed border-neutral-400 dark:border-neutral-600 bg-white/85 dark:bg-black/85 pointer-events-none">
					<LuUpload size={24} className="text-neutral-500" />
					<p className="text-[1rem] font-[600]">Drop to import</p>
					<p className="text-[.875rem] text-neutral-500 text-center text-balance">
						The first file opens, the rest are saved to this
						browser.
						{files.dirty && ` ${files.name} is saved first.`}
					</p>
				</div>
			)}
		</div>
	);
}
