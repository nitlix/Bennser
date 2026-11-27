"use client";

import { createContext, Fragment, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import s from "./Dock.module.scss";
import type { LayoutApi, PanelId, Side } from "./useLayout";

/** What a docked panel's header needs: a drag handle and a hide button. */
export type DockCell = {
	handle: React.HTMLAttributes<HTMLElement> & { draggable: true };
	hide: () => void;
};

export const DockCellContext = createContext<DockCell | null>(null);

const MIME = "application/x-bennser-panel";
const MIN_PX = 160;

function sideOf(e: React.DragEvent, el: HTMLElement): Side {
	const r = el.getBoundingClientRect();
	const x = (e.clientX - r.left) / r.width;
	const y = (e.clientY - r.top) / r.height;
	const distances: [Side, number][] = [
		["left", x],
		["right", 1 - x],
		["top", y],
		["bottom", 1 - y],
	];
	return distances.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

type SplitterProps = {
	axis: "x" | "y";
	onResize: (a: number, b: number) => void;
	sizes: [number, number];
};

/** Drag handle between two neighbours. Works in pixels, stores flex-grow ratios. */
function Splitter({ axis, onResize, sizes }: SplitterProps) {
	const ref = useRef<HTMLDivElement>(null);

	function onPointerDown(e: React.PointerEvent) {
		const el = ref.current;
		const before = el?.previousElementSibling as HTMLElement | null;
		const after = el?.nextElementSibling as HTMLElement | null;
		if (!el || !before || !after) return;

		e.preventDefault();
		el.setPointerCapture(e.pointerId);
		const dim = axis === "x" ? "width" : "height";
		const startPx = [
			before.getBoundingClientRect()[dim],
			after.getBoundingClientRect()[dim],
		] as const;
		const totalPx = startPx[0] + startPx[1];
		const total = sizes[0] + sizes[1];
		const start = axis === "x" ? e.clientX : e.clientY;
		document.body.dataset.resizing = axis;

		const move = (ev: PointerEvent) => {
			const delta = (axis === "x" ? ev.clientX : ev.clientY) - start;
			const a = Math.min(
				Math.max(startPx[0] + delta, MIN_PX),
				totalPx - MIN_PX,
			);
			onResize((total * a) / totalPx, (total * (totalPx - a)) / totalPx);
		};
		const up = () => {
			delete document.body.dataset.resizing;
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
			el.removeEventListener("pointercancel", up);
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", up);
	}

	return (
		<div
			ref={ref}
			className={twMerge(s.splitter, axis === "x" ? s.splitX : s.splitY)}
			onPointerDown={onPointerDown}
			role="separator"
			aria-orientation={axis === "x" ? "vertical" : "horizontal"}
		/>
	);
}

type Props = { layout: LayoutApi; render: (id: PanelId) => React.ReactNode };

/** Columns of panels: drag a panel's title to move it, drag the gaps to resize. */
export default function ({ layout, render }: Props) {
	const [dragging, setDragging] = useState<PanelId | null>(null);
	const [target, setTarget] = useState<{ id: PanelId; side: Side } | null>(
		null,
	);
	const { columns } = layout.layout;

	function cellContext(id: PanelId): DockCell {
		return {
			hide: () => layout.hide(id),
			handle: {
				draggable: true,
				onDragStart: (e) => {
					e.dataTransfer.setData(MIME, id);
					e.dataTransfer.effectAllowed = "move";
					const panel = (e.currentTarget as HTMLElement).closest(
						"section",
					);
					if (panel) e.dataTransfer.setDragImage(panel, 24, 20);
					setDragging(id);
				},
				onDragEnd: () => {
					setDragging(null);
					setTarget(null);
				},
			},
		};
	}

	function dropProps(id: PanelId): React.HTMLAttributes<HTMLDivElement> {
		if (!dragging || dragging === id) return {};
		return {
			onDragOver: (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				const side = sideOf(e, e.currentTarget);
				if (target?.id !== id || target.side !== side)
					setTarget({ id, side });
			},
			onDragLeave: (e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node))
					setTarget(null);
			},
			onDrop: (e) => {
				e.preventDefault();
				const from = e.dataTransfer.getData(MIME) as PanelId;
				if (from) layout.move(from, id, sideOf(e, e.currentTarget));
				setDragging(null);
				setTarget(null);
			},
		};
	}

	if (!columns.length) {
		return (
			<div className={s.empty}>
				Every panel is hidden. Bring some back from the View menu.
			</div>
		);
	}

	return (
		<div className={twMerge(s.dock, !layout.floating && s.full)}>
			{columns.map((col, c) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity of their own
				<Fragment key={c}>
					{c > 0 && (
						<Splitter
							axis="x"
							sizes={[columns[c - 1]!.size, col.size]}
							onResize={(a, b) =>
								layout.resize(null, c - 1, a, b)
							}
						/>
					)}
					<div className={s.column} style={{ flexGrow: col.size }}>
						{col.cells.map((cell, i) => (
							<Fragment key={cell.id}>
								{i > 0 && (
									<Splitter
										axis="y"
										sizes={[
											col.cells[i - 1]!.size,
											cell.size,
										]}
										onResize={(a, b) =>
											layout.resize(c, i - 1, a, b)
										}
									/>
								)}
								<div
									className={twMerge(
										s.cell,
										dragging === cell.id && s.lifted,
									)}
									style={{ flexGrow: cell.size }}
									{...dropProps(cell.id)}
								>
									<DockCellContext.Provider
										value={cellContext(cell.id)}
									>
										{render(cell.id)}
									</DockCellContext.Provider>
									{target?.id === cell.id && (
										<div
											className={twMerge(
												s.drop,
												s[target.side],
											)}
										/>
									)}
								</div>
							</Fragment>
						))}
					</div>
				</Fragment>
			))}
		</div>
	);
}
