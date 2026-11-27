"use client";

import type { AssembleError } from "@bennser/asm/browser";
import {
	type Kmd,
	Machine,
	type StepTrace,
	type StopReason,
} from "@bennser/core";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { useStored } from "./useStored";

export const SPEEDS = [
	{ label: "1/s", name: "Very slow", perSecond: 1 },
	{ label: "4/s", name: "Slow", perSecond: 4 },
	{ label: "16/s", name: "Normal", perSecond: 16 },
	{ label: "60/s", name: "Fast", perSecond: 60 },
	{ label: "1k/s", name: "Very fast", perSecond: 1000 },
] as const;

/** Instructions per step press, as in Bennett's Step Speed menu ("Multistep" when not 1). */
export const STEP_SIZES = [1, 2, 5, 10, 20, 50] as const;

const HISTORY = 200_000;
const MAX_PER_FRAME = 250_000;

/** "fast" runs flat out (the program usually finishes within a frame), "animate" plays at the chosen speed. */
export type RunMode = "fast" | "animate";

const isCode = (line: Kmd["lines"][number]) => line.chunk === 4 && !line.data;

/** Source-line breakpoints → instruction addresses. A line with no code snaps to the next one that has some. */
function resolveBreakpoints(kmd: Kmd | null, lines: Set<number>) {
	if (!kmd) return [];
	const code = kmd.lines.filter(isCode);
	const addresses = new Set<number>();
	for (const line of lines) {
		const hit = code.find((l) => l.sourceLine >= line);
		if (hit) addresses.add(hit.address);
	}
	return [...addresses];
}

/** Keep breakpoints on the same code when lines are inserted or deleted above them. */
function shiftBreakpoints(lines: Set<number>, before: string, after: string) {
	if (!lines.size) return lines;
	let prefix = 0;
	while (prefix < before.length && before[prefix] === after[prefix]) prefix++;
	const at = before.slice(0, prefix).split("\n").length;
	const delta = after.split("\n").length - before.split("\n").length;
	if (!delta) return lines;

	const next = new Set<number>();
	for (const line of lines) {
		if (line <= at) next.add(line);
		else if (line + delta > at) next.add(line + delta);
	}
	return next;
}

export function useMachine(initialSource: string) {
	const machineRef = useRef<Machine | null>(null);
	machineRef.current ??= new Machine({ history: HISTORY });
	const machine = machineRef.current;

	const [, rerender] = useReducer((n: number) => n + 1, 0);
	const [source, setSourceState] = useState(initialSource);
	const sourceRef = useRef(initialSource);
	const [assembled, setAssembled] = useState<{
		source: string;
		kmd: string;
	} | null>(null);
	const [errors, setErrors] = useState<AssembleError[]>([]);
	const [running, setRunningState] = useState<RunMode | null>(null);
	// Synchronous mirror: a queued animation frame must not run after a pause.
	const runningRef = useRef<RunMode | null>(null);
	const lastRunMode = useRef<RunMode>("fast");
	const setRunning = useCallback((value: RunMode | null) => {
		runningRef.current = value;
		if (value) lastRunMode.current = value;
		setRunningState(value);
	}, []);
	const [reason, setReason] = useState<StopReason | null>(null);
	const [speedIndex, setSpeedIndex] = useStored(
		"bennser:speed",
		2,
		(v) =>
			Number.isInteger(v) &&
			(v as number) >= 0 &&
			(v as number) < SPEEDS.length,
	);
	const [stepSize, setStepSize] = useStored<number>(
		"bennser:stepSize",
		1,
		(v) => STEP_SIZES.includes(v as (typeof STEP_SIZES)[number]),
	);
	// How many instructions the latest step press actually ran, so ← exactly undoes a
	// multistep that stopped early. Tagged with the history top it left behind: if anything
	// else (a run, a reload, another ←) has moved the machine since, it no longer applies.
	const lastStep = useRef<{
		count: number;
		top: Machine["history"][number] | undefined;
	} | null>(null);
	const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
	// Bennett's "Breakpoint Global Enable": off keeps breakpoints listed but inactive.
	const [breakpointsEnabled, setBreakpointsEnabled] = useStored(
		"bennser:breakpointsEnabled",
		true,
		(v) => typeof v === "boolean",
	);
	const breakpointsEnabledRef = useRef(breakpointsEnabled);
	breakpointsEnabledRef.current = breakpointsEnabled;
	const [busy, setBusy] = useState(false);

	const loaded = assembled !== null;
	const stale = !loaded || assembled.source !== source;
	const finished = reason === "stopped" || reason === "div-by-zero";
	const lastTrace: StepTrace | null = machine.history.at(-1)?.trace ?? null;
	const pcLine = stale
		? null
		: (machine.kmd?.sourceAt.get(machine.cpu.pc)?.sourceLine ?? null);

	const breakpointAddresses = useMemo(
		() => resolveBreakpoints(machine.kmd, breakpoints),
		// machine.kmd changes exactly when `assembled` does.
		[assembled, breakpoints, machine],
	);

	useEffect(() => {
		machine.cpu.breakpoints = breakpointAddresses.map((address) => ({
			address,
			active: breakpointsEnabled,
		}));
		// A trap latched before disabling must not stop the next run chunk.
		if (!breakpointsEnabled) machine.cpu.trapped = false;
	}, [breakpointAddresses, breakpointsEnabled, machine]);

	const stop = useCallback(
		(why: StopReason | null) => {
			machine.pause();
			setRunning(null);
			setReason(why);
			rerender();
		},
		[machine, setRunning],
	);

	// ------------------------------------------------------------- run loop
	useEffect(() => {
		if (!running) return;

		const perSecond = SPEEDS[speedIndex]!.perSecond;
		let frame = 0;
		let last = performance.now();
		let budget = 1; // first instruction runs immediately
		let resume = true; // only the first chunk may step off a breakpoint

		const tick = (now: number) => {
			if (!runningRef.current) return;
			// rAF's timestamp is the frame start, which can be earlier than `last`: never go negative.
			budget += (Math.max(0, now - last) / 1000) * perSecond;
			last = Math.max(last, now);

			// Fast mode ignores the budget entirely (Infinity arithmetic turns into NaN).
			const steps =
				running === "fast"
					? MAX_PER_FRAME
					: Math.min(Math.floor(budget), MAX_PER_FRAME);
			if (steps > 0) {
				budget -= steps;
				const result = machine.run(steps, { resume });
				resume = false;
				if (result.reason !== "step-limit") {
					stop(result.reason);
					return;
				}
				machine.pause();
				rerender();
			}
			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [running, speedIndex, machine, stop]);

	// -------------------------------------------------------------- actions
	/** Assemble the current source and load it, paused at the first instruction. */
	const load = useCallback(
		async (text = source, input?: string) => {
			setBusy(true);
			setRunning(null);
			// Lazy: the assembler is ~735 kB of inlined WASM.
			const { assemble } = await import("@bennser/asm/browser");
			const result = await assemble(text);
			setBusy(false);

			if (!result.ok) {
				setErrors(result.errors);
				return false;
			}

			setErrors([]);
			machine.loadKmd(result.kmd);
			machine.cpu.breakpoints = resolveBreakpoints(
				machine.kmd,
				breakpoints,
			).map((address) => ({
				address,
				active: breakpointsEnabledRef.current,
			}));
			if (input) machine.input(input);
			setAssembled({ source: text, kmd: result.kmd });
			setReason(null);
			rerender();
			return true;
		},
		[machine, source, breakpoints, setRunning],
	);

	/** Make sure an up-to-date, not-yet-finished program is loaded. */
	const ensureLoaded = useCallback(async () => {
		if (stale) return load();
		if (finished) {
			machine.loadKmd(assembled!.kmd);
			setReason(null);
		}
		return true;
	}, [stale, finished, load, machine, assembled]);

	const start = useCallback(
		async (mode: RunMode) => {
			if (runningRef.current === mode) {
				stop(null);
				return;
			}
			if (!(await ensureLoaded())) return;
			setReason(null);
			setRunning(mode);
		},
		[ensureLoaded, stop, setRunning],
	);

	const run = useCallback(() => start("fast"), [start]);
	const animate = useCallback(() => start("animate"), [start]);
	const pause = useCallback(() => stop(null), [stop]);

	const restart = useCallback(async () => {
		setRunning(null);
		if (stale) {
			await load();
			return;
		}
		machine.loadKmd(assembled!.kmd);
		setReason(null);
		rerender();
	}, [stale, load, machine, assembled, setRunning]);

	const step = useCallback(async () => {
		// First step after an edit just assembles and parks on the first instruction.
		if (stale) {
			await load();
			return;
		}
		if (finished) return;
		setRunning(null);
		machine.pause();

		// Multistep: up to stepSize instructions, stopping early on anything that stops a
		// run. Breakpoints only cut a multistep short; a single step walks through them.
		let why: StopReason | null = null;
		let executed = 0;
		for (let i = 0; i < stepSize; i++) {
			const top = machine.history.at(-1);
			why = machine.step();
			if (machine.history.at(-1) !== top) executed++;
			if (why) break;
			if (stepSize > 1 && machine.cpu.trapped) {
				why = "breakpoint";
				break;
			}
		}

		lastStep.current = { count: executed, top: machine.history.at(-1) };
		setReason(why);
		rerender();
	}, [stale, finished, load, machine, setRunning, stepSize]);

	/** Undo the latest step press (however far it got), otherwise stepSize instructions. */
	const back = useCallback(() => {
		if (stale) return;
		setRunning(null);
		machine.pause();
		const last = lastStep.current;
		const count =
			last?.count && last.top === machine.history.at(-1)
				? last.count
				: stepSize;
		lastStep.current = null;
		for (let i = 0; i < count && machine.undo(); i++);
		setReason(null);
		rerender();
	}, [stale, machine, setRunning, stepSize]);

	const sendInput = useCallback(
		(text: string | Uint8Array) => {
			machine.input(text);
			if (reason === "waiting-input") {
				setReason(null);
				setRunning(lastRunMode.current);
			}
			rerender();
		},
		[machine, reason, setRunning],
	);

	const setSource = useCallback(
		(next: string) => {
			const prev = sourceRef.current;
			sourceRef.current = next;
			setSourceState(next);
			setBreakpoints((lines) => shiftBreakpoints(lines, prev, next));
			if (runningRef.current) stop(null);
		},
		[stop],
	);

	/** Replace the whole program (examples, restore); breakpoints are replaced with it. */
	const replaceSource = useCallback((next: string, lines: number[] = []) => {
		sourceRef.current = next;
		setSourceState(next);
		setBreakpoints(new Set(lines));
	}, []);

	/** Edit a register; safe mid-run, the next frame just carries on with the new value. */
	const setReg = useCallback(
		(n: number, value: number) => {
			machine.setReg(n, value);
			rerender();
		},
		[machine],
	);

	/** Bennett's "Zero registers": x1–x31 and PC to 0. Safe mid-run, not undoable. */
	const zeroRegs = useCallback(() => {
		machine.zeroRegs();
		rerender();
	}, [machine]);

	/** Edit one memory byte; like setReg, safe mid-run and not undoable. */
	const setMem = useCallback(
		(address: number, byte: number) => {
			machine.setMem(address, byte);
			rerender();
		},
		[machine],
	);

	/** Edit one aligned memory word; same rules as setMem. */
	const setWord = useCallback(
		(address: number, word: number) => {
			machine.setWord(address, word);
			rerender();
		},
		[machine],
	);

	const toggleBreakpoint = useCallback((line: number) => {
		setBreakpoints((prev) => {
			const next = new Set(prev);
			if (!next.delete(line)) next.add(line);
			return next;
		});
	}, []);

	return {
		machine,
		lastTrace,
		source,
		setSource,
		replaceSource,
		errors,
		loaded,
		stale,
		running,
		reason,
		finished,
		busy,
		pcLine,
		speedIndex,
		setSpeedIndex,
		stepSize,
		setStepSize,
		breakpoints,
		breakpointAddresses,
		breakpointsEnabled,
		setBreakpointsEnabled,
		load,
		run,
		animate,
		pause,
		restart,
		step,
		back,
		sendInput,
		setReg,
		zeroRegs,
		setMem,
		setWord,
		toggleBreakpoint,
	};
}

export type MachineApi = ReturnType<typeof useMachine>;
