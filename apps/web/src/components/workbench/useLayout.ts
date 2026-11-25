"use client";

import { useCallback, useEffect, useState } from "react";

export const PANELS = [
	{ id: "source", title: "Source" },
	{ id: "code", title: "Machine code" },
	{ id: "datapath", title: "Datapath" },
	{ id: "console", title: "Console" },
	{ id: "registers", title: "Registers" },
	{ id: "memory", title: "Memory" },
] as const;

export type PanelId = (typeof PANELS)[number]["id"];
export type Side = "top" | "bottom" | "left" | "right";

type Cell = { id: PanelId; size: number };
type Column = { size: number; cells: Cell[] };
export type Layout = { version: 1; columns: Column[] };

const STORAGE_KEY = "bennser:layout";

export const DEFAULT_LAYOUT: Layout = {
	version: 1,
	columns: [
		{ size: 1, cells: [{ id: "source", size: 1 }] },
		// Datapath starts hidden; turn it on from the View menu.
		{ size: 1.2, cells: [{ id: "console", size: 1 }] },
		{
			size: 0.9,
			cells: [
				{ id: "registers", size: 1.15 },
				{ id: "memory", size: 1 },
			],
		},
	],
};

const isPanel = (id: unknown): id is PanelId => PANELS.some((p) => p.id === id);

function parse(raw: string | null): Layout | null {
	if (!raw) return null;
	try {
		const layout = JSON.parse(raw) as Layout;
		if (layout.version !== 1 || !Array.isArray(layout.columns)) return null;
		const valid = layout.columns.every(
			(c) =>
				c.size > 0 &&
				c.cells.every((cell) => isPanel(cell.id) && cell.size > 0),
		);
		return valid ? layout : null;
	} catch {
		return null;
	}
}

/** Remove a panel, dropping any column left empty. Returns the panel's old size (or 1). */
function without(columns: Column[], id: PanelId): [Column[], number] {
	let size = 1;
	const next = columns
		.map((col) => {
			const cell = col.cells.find((c) => c.id === id);
			if (cell) size = cell.size;
			return { ...col, cells: col.cells.filter((c) => c.id !== id) };
		})
		.filter((col) => col.cells.length > 0);
	return [next, size];
}

export function useLayout() {
	const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);

	useEffect(() => {
		const saved = parse(localStorage.getItem(STORAGE_KEY));
		if (saved) setLayout(saved);
	}, []);

	const update = useCallback((fn: (columns: Column[]) => Column[]) => {
		setLayout((prev) => {
			const next: Layout = { version: 1, columns: fn(prev.columns) };
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			return next;
		});
	}, []);

	const visible = new Set(
		layout.columns.flatMap((c) => c.cells.map((cell) => cell.id)),
	);

	const hide = useCallback(
		(id: PanelId) => update((cols) => without(cols, id)[0]),
		[update],
	);

	const show = useCallback(
		(id: PanelId) =>
			update((cols) => {
				if (!cols.length)
					return [{ size: 1, cells: [{ id, size: 1 }] }];
				// Fewest panels wins; ties go to the rightmost column.
				const target = cols.reduce(
					(best, col, i) =>
						col.cells.length <= cols[best]!.cells.length ? i : best,
					0,
				);
				return cols.map((col, i) =>
					i === target
						? { ...col, cells: [...col.cells, { id, size: 1 }] }
						: col,
				);
			}),
		[update],
	);

	const toggle = useCallback(
		(id: PanelId) => (visible.has(id) ? hide(id) : show(id)),
		[visible, hide, show],
	);

	/** Drop `id` on one side of `target`: top/bottom stack it in that column, left/right open a new column. */
	const move = useCallback(
		(id: PanelId, target: PanelId, side: Side) =>
			update((cols) => {
				if (id === target) return cols;
				const [rest, size] = without(cols, id);
				const colIndex = rest.findIndex((c) =>
					c.cells.some((cell) => cell.id === target),
				);
				if (colIndex < 0) return cols;

				if (side === "left" || side === "right") {
					const column: Column = {
						size: rest[colIndex]!.size,
						cells: [{ id, size: 1 }],
					};
					rest.splice(
						side === "left" ? colIndex : colIndex + 1,
						0,
						column,
					);
					return rest;
				}

				const col = rest[colIndex]!;
				const cells = [...col.cells];
				const at =
					cells.findIndex((c) => c.id === target) +
					(side === "bottom" ? 1 : 0);
				cells.splice(at, 0, { id, size });
				rest[colIndex] = { ...col, cells };
				return rest;
			}),
		[update],
	);

	/** Set the sizes of two neighbours (columns, or cells within column `col`). */
	const resize = useCallback(
		(col: number | null, index: number, a: number, b: number) =>
			update((cols) => {
				const next = cols.map((c) => ({ ...c, cells: [...c.cells] }));
				if (col === null) {
					next[index]!.size = a;
					next[index + 1]!.size = b;
					return next;
				}
				const cells = next[col]!.cells;
				cells[index] = { ...cells[index]!, size: a };
				cells[index + 1] = { ...cells[index + 1]!, size: b };
				return next;
			}),
		[update],
	);

	const reset = useCallback(
		() => update(() => DEFAULT_LAYOUT.columns),
		[update],
	);

	return { layout, visible, hide, show, toggle, move, resize, reset };
}

export type LayoutApi = ReturnType<typeof useLayout>;
