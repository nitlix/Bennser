"use client";

import { useEffect, useRef, useState } from "react";
import {
	LuChevronDown,
	LuDownload,
	LuFileCode,
	LuFolderOpen,
	LuSave,
	LuTrash2,
	LuUpload,
} from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import Sunburst from "@/components/Sunburst";
import { EXAMPLES } from "./examples";
import s from "./FileMenu.module.scss";
import Menu, { MenuItem, SubMenu } from "./Menu";
import { type FilesApi, normaliseName } from "./useFiles";

type Props = {
	files: FilesApi;
	source: string;
	onSave: () => void;
	/** Open a program in the editor (asks first if that would drop unsaved changes). */
	onOpen: (name: string, text: string, input?: string) => void;
	/** Import picked files: the first opens, the rest are saved. */
	onImport: (files: File[]) => void;
	/** Increments on each successful save; each new value flashes a "Saved" badge. */
	saveCount: number;
};

function ago(ms: number) {
	const s = Math.round((Date.now() - ms) / 1000);
	if (s < 60) return "just now";
	const units: [number, string][] = [
		[60, "min"],
		[60, "h"],
		[24, "d"],
	];
	let n = s;
	let label = "s";
	for (const [size, unit] of units) {
		if (n < size) break;
		n = Math.floor(n / size);
		label = unit;
	}
	if (label === "d" && n > 30) return new Date(ms).toLocaleDateString();
	return `${n}${label === "min" ? " min" : label} ago`;
}

/**
 * The Source panel's file controls: an editable filename pill (always `*.s`, amber dot
 * while unsaved) and a menu to save to the browser, load a save, import or download a file,
 * or open an example.
 */
export default function ({
	files,
	source,
	onSave,
	onOpen,
	onImport,
	saveCount,
}: Props) {
	const [draft, setDraft] = useState(files.name);
	const [mac, setMac] = useState(true);
	const picker = useRef<HTMLInputElement>(null);
	const editing = useRef(false);
	const justFocused = useRef(false);

	useEffect(() => {
		if (!editing.current) setDraft(files.name);
	}, [files.name]);
	useEffect(() => setMac(/Mac|iP(hone|ad)/.test(navigator.userAgent)), []);

	function commit() {
		editing.current = false;
		const next = normaliseName(draft);
		if (!next) return setDraft(files.name);
		setDraft(next);
		files.rename(next);
	}

	function download() {
		const url = URL.createObjectURL(
			new Blob([source], { type: "text/plain" }),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = files.name;
		a.click();
		URL.revokeObjectURL(url);
	}

	function onPick(e: React.ChangeEvent<HTMLInputElement>) {
		const picked = [...(e.target.files ?? [])];
		e.target.value = "";
		if (picked.length) onImport(picked);
	}

	return (
		<div className="relative flex flex-row items-center gap-[.3rem] min-w-0">
			<label
				className={s.pill}
				title={
					files.dirty
						? "Unsaved changes. Save with ⌘S / Ctrl+S"
						: "File name (click to rename)"
				}
			>
				<input
					className={s.name}
					value={draft}
					spellCheck={false}
					aria-label="File name"
					onMouseUp={(e) => {
						// Keep the stem selection from onFocus instead of placing the caret.
						if (!justFocused.current) return;
						justFocused.current = false;
						e.preventDefault();
					}}
					onFocus={(e) => {
						editing.current = true;
						justFocused.current = true;
						// Select the stem, so typing replaces the name but keeps ".s".
						// Next frame: a mouse focus places the caret after this handler.
						const input = e.target;
						requestAnimationFrame(() =>
							input.setSelectionRange(
								0,
								Math.max(0, input.value.length - 2),
							),
						);
					}}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
						if (e.key !== "Escape") return;
						const input = e.currentTarget;
						setDraft(files.name);
						// After the revert renders, so the blur commits the old name.
						requestAnimationFrame(() => input.blur());
					}}
				/>
				{files.dirty && (
					<span className={s.dirty} aria-label="Unsaved changes" />
				)}
			</label>

			<Menu
				icon
				size="small"
				label={<LuChevronDown size={16} />}
				title="File: save, load, import, download"
			>
				{(close) => (
					<>
						<MenuItem
							onClick={() => {
								onSave();
								close();
							}}
						>
							<LuSave size={16} className="shrink-0" />
							Save
							<span className="ml-auto text-neutral-500 text-[.8rem]">
								{mac ? "⌘S" : "Ctrl+S"}
							</span>
						</MenuItem>
						<SubMenu
							label={
								<>
									<LuFolderOpen
										size={16}
										className="shrink-0"
									/>
									Load
								</>
							}
							panelClassName="min-w-[16rem] max-w-[22rem]"
						>
							{(closeAll) =>
								files.saves.length ? (
									files.saves.map((entry) => (
										<div
											key={entry.name}
											className={s.entry}
										>
											<MenuItem
												className="min-w-0"
												onClick={() => {
													const text = files.read(
														entry.name,
													);
													closeAll();
													if (text === null) return;
													onOpen(entry.name, text);
												}}
											>
												{/* File-type mark (one language for now); amber = open. */}
												<Sunburst
													className={twMerge(
														"size-[1rem] text-neutral-400 dark:text-neutral-600",
														entry.name ===
															files.name &&
															"text-amber-500 dark:text-amber-500",
													)}
												/>
												<span className="truncate text-[.8rem]">
													{entry.name}
												</span>
												<span className="ml-auto pl-[.75rem] shrink-0 text-[.8rem] text-neutral-500 font-[400]">
													{ago(entry.savedAt)}
												</span>
											</MenuItem>
											<button
												type="button"
												className={s.remove}
												title={`Delete ${entry.name} from this browser`}
												aria-label={`Delete ${entry.name}`}
												onClick={() => {
													if (
														confirm(
															`Delete ${entry.name} from this browser? This can't be undone.`,
														)
													)
														files.remove(
															entry.name,
														);
												}}
											>
												<LuTrash2 size={16} />
											</button>
										</div>
									))
								) : (
									<p className={s.empty}>
										Nothing saved yet. Save keeps the
										program in this browser.
									</p>
								)
							}
						</SubMenu>
						<div className="h-[1px] my-[.25rem] bg-neutral-200 dark:bg-neutral-800" />
						<MenuItem
							onClick={() => {
								close();
								picker.current?.click();
							}}
						>
							<LuUpload size={16} className="shrink-0" />
							Import files…
						</MenuItem>
						<MenuItem
							onClick={() => {
								download();
								close();
							}}
						>
							<LuDownload size={16} className="shrink-0" />
							Download
							<span className="ml-auto pl-[.75rem] truncate text-[.8rem] text-neutral-500 font-[400]">
								{files.name}
							</span>
						</MenuItem>
						<div className="h-[1px] my-[.25rem] bg-neutral-200 dark:bg-neutral-800" />
						<SubMenu
							label={
								<>
									<LuFileCode
										size={16}
										className="shrink-0"
									/>
									Load example
								</>
							}
						>
							{(closeAll) =>
								EXAMPLES.map((ex) => (
									<MenuItem
										key={ex.id}
										onClick={() => {
											closeAll();
											onOpen(
												ex.file,
												ex.source,
												ex.input,
											);
										}}
									>
										{ex.title}
									</MenuItem>
								))
							}
						</SubMenu>
					</>
				)}
			</Menu>
			{saveCount > 0 && (
				// Keyed by the count so every save restarts the fade.
				<span key={saveCount} className={s.saved} role="status">
					<LuSave size={14} />
					Saved
				</span>
			)}
			<input
				ref={picker}
				type="file"
				accept=".s,.S,.asm,.txt,text/plain"
				multiple
				className="hidden"
				onChange={onPick}
			/>
		</div>
	);
}
