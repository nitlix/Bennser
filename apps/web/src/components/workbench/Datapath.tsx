"use client";

import type { StepTrace } from "@bennser/core";
import { twMerge } from "tailwind-merge";
import PanelBase from "@/components/PanelBase";
import PillBase from "@/components/PillBase";
import { BLOCKS, type Block, flowOf, WIRES } from "./datapathFlow";
import s from "./Datapath.module.scss";

/** Blocks lit by an active wire touching them. */
const BLOCK_WIRES: Record<string, string[]> = {
	pc: ["pc_imem"],
	add4: ["add4_next"],
	imem: ["imem_dec"],
	dec: ["imem_dec"],
	imm: ["dec_imm"],
	rf: ["dec_rf", "wb_rf"],
	mux: ["mux_alu"],
	alu: ["mux_alu", "rs1_alu", "pc_alu"],
	tgt: ["tgt_next"],
	dmem: ["alu_dmem"],
	wb: ["wb_rf"],
	io: ["rf_io"],
};

function Shape({ block, on }: { block: Block; on: boolean }) {
	const { x, y, w, h } = block;
	const cls = twMerge(s.block, on && s.on);

	if (block.shape === "alu") {
		const notch = h * 0.18;
		const points = [
			[x, y],
			[x + w, y + h * 0.25],
			[x + w, y + h * 0.75],
			[x, y + h],
			[x, y + h / 2 + notch],
			[x + w * 0.25, y + h / 2],
			[x, y + h / 2 - notch],
		];
		return (
			<polygon
				className={cls}
				points={points.map((p) => p.join(",")).join(" ")}
			/>
		);
	}

	return (
		<rect
			className={cls}
			x={x}
			y={y}
			width={w}
			height={h}
			rx={block.shape === "mux" ? w / 2 : 8}
		/>
	);
}

type Props = { trace: StepTrace | null };

export default function ({ trace }: Props) {
	const flow = trace ? flowOf(trace) : null;
	const active = flow?.active ?? new Set<string>();

	const actions = flow && (
		<div className="flex flex-row items-center gap-[.5rem] min-w-0">
			<PillBase className="h-[1.75rem] border-amber-500/40 text-amber-600 dark:text-amber-400 font-mono">
				{flow.decoded.cls}
			</PillBase>
			<span className="font-mono text-[.8rem] text-black dark:text-white truncate">
				{flow.summary}
			</span>
		</div>
	);

	return (
		<PanelBase title="Datapath" actions={actions}>
			<div className="flex-1 min-h-0 grid place-items-center p-[.75rem]">
				<svg
					viewBox="0 0 880 380"
					className={s.svg}
					role="img"
					aria-label="Single-cycle RISC-V datapath"
				>
					<defs>
						<marker
							id="arrow"
							viewBox="0 0 8 8"
							refX="7"
							refY="4"
							markerWidth="6"
							markerHeight="6"
							orient="auto"
						>
							<path
								d="M0 0 L8 4 L0 8 z"
								className="fill-amber-500"
							/>
						</marker>
					</defs>

					{Object.entries(WIRES).map(([id, path]) => (
						<path key={id} d={path} className={s.wire} />
					))}
					{Object.entries(WIRES)
						.filter(([id]) => active.has(id))
						.map(([id, path]) => (
							<path
								key={`on-${id}`}
								d={path}
								className={s.wireOn}
								markerEnd="url(#arrow)"
							/>
						))}

					{BLOCKS.map((block) => (
						<g key={block.id}>
							<Shape
								block={block}
								on={(BLOCK_WIRES[block.id] ?? []).some((w) =>
									active.has(w),
								)}
							/>
							{block.label.map((line, i) => (
								<text
									key={line}
									className={s.blockLabel}
									x={
										block.x +
										block.w / 2 +
										(block.shape === "alu" ? 6 : 0)
									}
									y={
										block.y +
										block.h / 2 +
										(i - (block.label.length - 1) / 2) * 15
									}
								>
									{line}
								</text>
							))}
						</g>
					))}

					{flow?.labels.map((label) => {
						const width = label.text.length * 6.8 + 10;
						return (
							<g key={`${label.wire}-${label.text}`}>
								<rect
									className={s.valueBg}
									x={label.at[0] - width / 2}
									y={label.at[1] - 9}
									width={width}
									height={18}
									rx={5}
								/>
								<text
									className={s.value}
									x={label.at[0]}
									y={label.at[1] + 1}
								>
									{label.text}
								</text>
							</g>
						);
					})}

					{!flow && (
						<text className={s.blockLabel} x={440} y={372}>
							Assemble and step to watch data move through the CPU
						</text>
					)}
				</svg>
			</div>
		</PanelBase>
	);
}
