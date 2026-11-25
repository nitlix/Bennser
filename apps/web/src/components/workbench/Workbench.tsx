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
import { useFiles } from "./useFiles";
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

	/** Open a program (save, import, example), checking before dropping unsaved work. */
	function open(name: string, text: string, input?: string) {
		const discard =
			!files.dirty ||
			confirm(
				`${files.name} has unsaved changes. Open ${name} anyway and lose them?`,
			);
		if (!discard) return;
		files.opened(name, text);
		api.replaceSource(text);
		api.load(text, input);
	}

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
		<div className="flex flex-col gap-[.75rem] w-full h-dvh p-[.75rem] bg-neutral-50 dark:bg-neutral-950 overflow-auto lg:overflow-hidden">
			<Toolbar api={api} layout={layout} />
			<Dock layout={layout} render={(id) => panels[id]()} />
		</div>
	);
}
