"use client";

import {
	LuCheck,
	LuChevronLeft,
	LuChevronRight,
	LuFileCode,
	LuLayoutPanelLeft,
	LuPause,
	LuPlay,
	LuRotateCcw,
	LuSnail,
} from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import ButtonPrimary from "@/components/(buttons)/ButtonPrimary";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import Logo from "@/components/Logo";
import PillBase from "@/components/PillBase";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { EXAMPLES } from "./examples";
import Menu, { MenuItem } from "./Menu";
import type { LayoutApi } from "./useLayout";
import { PANELS } from "./useLayout";
import { type MachineApi, SPEEDS } from "./useMachine";

const STOPPED: Record<string, { text: string; tone: string }> = {
	stopped: { text: "Finished", tone: "bg-emerald-500" },
	"div-by-zero": { text: "Halted on a divide by zero", tone: "bg-rose-500" },
	breakpoint: { text: "Paused at a breakpoint", tone: "bg-rose-500" },
	ebreak: { text: "Hit ebreak", tone: "bg-rose-500" },
	"waiting-input": {
		text: "Waiting for input in the console",
		tone: "bg-amber-500 animate-pulse",
	},
	stalled: { text: "Hung on an unknown ecall", tone: "bg-rose-500" },
};

function status(api: MachineApi): { text: string; tone: string } {
	if (api.busy)
		return { text: "Assembling…", tone: "bg-amber-500 animate-pulse" };
	if (api.errors.length) {
		const n = api.errors.length;
		return {
			text: `${n} assembler error${n === 1 ? "" : "s"}`,
			tone: "bg-rose-500",
		};
	}
	if (!api.loaded)
		return { text: "Not assembled yet", tone: "bg-neutral-400" };
	if (api.stale)
		return { text: "Edited since last run", tone: "bg-neutral-400" };
	if (api.running === "fast")
		return { text: "Running", tone: "bg-amber-500 animate-pulse" };
	if (api.running === "animate")
		return { text: "Animating", tone: "bg-amber-500 animate-pulse" };

	const where = api.pcLine ? ` on line ${api.pcLine}` : "";
	const stopped = api.reason && STOPPED[api.reason];
	if (stopped)
		return api.reason === "stopped"
			? stopped
			: { ...stopped, text: stopped.text + where };
	return {
		text: api.machine.history.length ? `Paused${where}` : `Ready${where}`,
		tone: "bg-sky-500",
	};
}

type Props = {
	api: MachineApi;
	layout: LayoutApi;
	onExample: (id: string) => void;
};

export default function ({ api, layout, onExample }: Props) {
	const { text, tone } = status(api);
	const live = api.loaded && !api.stale;
	const count = api.machine.cpu.instrCount;

	return (
		<div className="flex flex-row flex-wrap items-center gap-[.6rem] w-full px-[.75rem] pt-[.375rem] pb-[.25rem]">
			<Logo className="mr-[.75rem]" />

			<Menu label={<LuFileCode size={16} />} title="Load an example">
				{(close) =>
					EXAMPLES.map((ex) => (
						<MenuItem
							key={ex.id}
							onClick={() => {
								onExample(ex.id);
								close();
							}}
						>
							{ex.title}
						</MenuItem>
					))
				}
			</Menu>

			<div className="w-[1px] h-[1.75rem] bg-neutral-200 dark:bg-neutral-800 mx-[.25rem]" />

			<ButtonPrimary
				onClick={api.running === "fast" ? api.pause : api.run}
				disabled={api.busy}
				tone={api.running === "fast" ? "sky" : "amber"}
				className="min-w-[6.5rem]"
				title="Assemble and run to the end or the next breakpoint (⌘↵)"
			>
				{api.running === "fast" ? (
					<LuPause size={16} />
				) : (
					<LuPlay size={16} />
				)}
				{api.running === "fast"
					? "Pause"
					: live && api.machine.history.length && !api.finished
						? "Continue"
						: "Run"}
			</ButtonPrimary>

			<ButtonSecondary
				icon
				onClick={api.back}
				disabled={!live || !api.machine.canUndo}
				title="Step back (←)"
				aria-label="Step back"
			>
				<LuChevronLeft size={16} />
			</ButtonSecondary>
			<ButtonSecondary
				onClick={api.step}
				disabled={api.busy || (live && api.finished)}
				title="Step one instruction (→)"
			>
				Step
				<LuChevronRight size={16} />
			</ButtonSecondary>
			<ButtonSecondary
				icon
				onClick={api.restart}
				disabled={!api.loaded}
				title="Restart from the top"
				aria-label="Restart"
			>
				<LuRotateCcw size={16} />
			</ButtonSecondary>

			<div className="flex flex-row items-center gap-[.35rem]">
				<ButtonSecondary
					onClick={api.animate}
					aria-pressed={api.running === "animate"}
					disabled={api.busy}
					title="Play slowly so you can watch the datapath"
				>
					<LuSnail size={16} />
					Animate
				</ButtonSecondary>
				<Menu
					label={SPEEDS[api.speedIndex]!.label}
					title="Animation speed"
				>
					{(close) =>
						SPEEDS.map((speed, i) => (
							<MenuItem
								key={speed.label}
								role="menuitemradio"
								aria-checked={i === api.speedIndex}
								onClick={() => {
									api.setSpeedIndex(i);
									close();
								}}
							>
								<LuCheck
									size={16}
									className={twMerge(
										"shrink-0 text-amber-500",
										i !== api.speedIndex && "invisible",
									)}
								/>
								{speed.name}
								<span className="ml-auto text-neutral-500">
									{speed.label}
								</span>
							</MenuItem>
						))
					}
				</Menu>
			</div>

			<div className="flex flex-row items-center gap-[.6rem] ml-auto">
				<PillBase className="h-[2.5rem]">
					<span
						className={twMerge("size-[.5rem] rounded-full", tone)}
					/>
					{text}
				</PillBase>
				{live && count > 0n && (
					<PillBase className="h-[2.5rem] tabular-nums text-neutral-500 dark:text-neutral-400">
						{count.toLocaleString()} steps
					</PillBase>
				)}

				<Menu
					label={<LuLayoutPanelLeft size={16} />}
					title="Choose panels"
					align="right"
				>
					{() => (
						<>
							{PANELS.map((panel) => (
								<MenuItem
									key={panel.id}
									onClick={() => layout.toggle(panel.id)}
									aria-checked={layout.visible.has(panel.id)}
									role="menuitemcheckbox"
								>
									<span
										className={twMerge(
											"grid place-items-center size-[1.1rem] rounded-[.35rem] border-[1px] border-neutral-300 dark:border-neutral-700",
											layout.visible.has(panel.id) &&
												"bg-amber-400 border-amber-500 text-neutral-950",
										)}
									>
										{layout.visible.has(panel.id) && (
											<LuCheck
												size={12}
												strokeWidth={3}
											/>
										)}
									</span>
									{panel.title}
								</MenuItem>
							))}
							<div className="h-[1px] my-[.25rem] bg-neutral-200 dark:bg-neutral-800" />
							<MenuItem
								onClick={layout.reset}
								className="text-neutral-600 dark:text-neutral-300"
							>
								Reset layout
							</MenuItem>
							<p className="px-[.75rem] py-[.4rem] text-[.8rem] leading-relaxed text-neutral-500">
								Drag a panel by its title to move it, or drag
								the gaps between panels to resize.
							</p>
						</>
					)}
				</Menu>
				<ThemeSwitcher />
			</div>
		</div>
	);
}
