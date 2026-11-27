"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Programs saved in the browser. Each save is its own localStorage key (`bennser:save:<name>`)
 * so one big file can't push the rest over the quota in a single write; `bennser:saves` is
 * the index of which exist and when they were saved. The open file's name is
 * `bennser:fileName`.
 */
const INDEX_KEY = "bennser:saves";
const SAVE_PREFIX = "bennser:save:";
const NAME_KEY = "bennser:fileName";
export const DEFAULT_NAME = "script1.s";

export type SaveEntry = { name: string; savedAt: number };

const saveKey = (name: string) => SAVE_PREFIX + name;

/** Index entries whose save still exists, newest first. */
function readIndex(): SaveEntry[] {
	try {
		const raw: unknown = JSON.parse(
			localStorage.getItem(INDEX_KEY) ?? "[]",
		);
		if (!Array.isArray(raw)) return [];
		return raw
			.filter(
				(e): e is SaveEntry =>
					typeof e?.name === "string" &&
					typeof e?.savedAt === "number" &&
					localStorage.getItem(saveKey(e.name)) !== null,
			)
			.sort((a, b) => b.savedAt - a.savedAt);
	} catch {
		return [];
	}
}

function writeIndex(index: SaveEntry[]) {
	localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/**
 * Tidy a typed or imported name into `something.s`: no slashes or control characters, and
 * any other extension swapped for `.s`. Returns null when nothing usable is left.
 */
export function normaliseName(raw: string): string | null {
	const clean = raw
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
		.trim()
		.slice(0, 64);
	const stem = clean.replace(/\.[^.]*$/, "").trim();
	if (!stem) return null;
	return `${stem}.s`;
}

/** Imports bigger than this are almost certainly not assembly. */
export const MAX_IMPORT = 1024 * 1024;

/**
 * A name for `wanted` that won't clobber a different save: itself if free (or already
 * holding exactly `text`), else `stem-2.s`, `stem-3.s`, …
 */
function freeName(wanted: string, text: string, avoid?: string): string {
	const stem = wanted.replace(/\.s$/, "");
	for (let n = 1; ; n++) {
		const name = n === 1 ? wanted : `${stem.slice(0, 60)}-${n}.s`;
		if (name === avoid) continue;
		const existing = localStorage.getItem(saveKey(name));
		if (existing === null || existing === text) return name;
	}
}

export function useFiles(source: string) {
	const [name, setName] = useState(DEFAULT_NAME);
	const [saves, setSaves] = useState<SaveEntry[]>([]);
	/** Source as of the last save/open; the file is "dirty" when the editor differs. */
	const [baseline, setBaseline] = useState<string | null>(null);

	// After mount (server and client render the same first frame).
	useEffect(() => {
		const stored = normaliseName(localStorage.getItem(NAME_KEY) ?? "");
		const current = stored ?? DEFAULT_NAME;
		setName(current);
		setSaves(readIndex());
		// Unsaved scratch work starts clean as restored, so a reload doesn't nag.
		setBaseline(
			localStorage.getItem(saveKey(current)) ??
				localStorage.getItem("bennser:source") ??
				source,
		);
	}, []);

	const rename = useCallback((next: string) => {
		setName(next);
		localStorage.setItem(NAME_KEY, next);
	}, []);

	/** Save the editor under the current name. Returns an error message on failure. */
	const save = useCallback((): string | null => {
		try {
			localStorage.setItem(saveKey(name), source);
		} catch {
			return "Browser storage is full. Delete some saves or download this file instead.";
		}
		const index = [
			{ name, savedAt: Date.now() },
			...readIndex().filter((e) => e.name !== name),
		];
		writeIndex(index);
		setSaves(index);
		setBaseline(source);
		return null;
	}, [name, source]);

	/**
	 * Save a program that isn't open (the extra files of a multi-file import), renamed
	 * rather than overwriting a different save of the same name (or taking `avoid`, the
	 * name the import is about to open). Returns the name used, or null when storage is full.
	 */
	const store = useCallback(
		(wanted: string, text: string, avoid?: string): string | null => {
			const name = freeName(wanted, text, avoid);
			try {
				localStorage.setItem(saveKey(name), text);
			} catch {
				return null;
			}
			const index = [
				{ name, savedAt: Date.now() },
				...readIndex().filter((e) => e.name !== name),
			];
			writeIndex(index);
			setSaves(index);
			return name;
		},
		[],
	);

	/** Read a save's source (null if it vanished). */
	const read = useCallback(
		(file: string) => localStorage.getItem(saveKey(file)),
		[],
	);

	const remove = useCallback((file: string) => {
		localStorage.removeItem(saveKey(file));
		const index = readIndex().filter((e) => e.name !== file);
		writeIndex(index);
		setSaves(index);
	}, []);

	/** Point at a newly opened program (save, example, import). */
	const opened = useCallback(
		(file: string, text: string) => {
			rename(file);
			setBaseline(text);
		},
		[rename],
	);

	const dirty = baseline !== null && source !== baseline;
	const saved = saves.some((e) => e.name === name);

	return {
		name,
		rename,
		saves,
		save,
		store,
		read,
		remove,
		opened,
		setBaseline,
		dirty,
		saved,
	};
}

export type FilesApi = ReturnType<typeof useFiles>;
