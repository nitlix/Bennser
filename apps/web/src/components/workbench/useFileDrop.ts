"use client";

import { useEffect, useRef, useState } from "react";

const hasFiles = (e: DragEvent) =>
	e.dataTransfer?.types.includes("Files") ?? false;

/**
 * Files dragged in from the OS anywhere on the page. Panel drags (`Dock`) and the
 * editor's text moves aren't file drags, so they pass straight through. Returns whether
 * files are over the page, for a drop overlay.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
	const [over, setOver] = useState(false);
	const latest = useRef(onFiles);
	latest.current = onFiles;

	useEffect(() => {
		// dragenter on the next element fires before dragleave on the last; count depth.
		let depth = 0;
		function enter(e: DragEvent) {
			if (!hasFiles(e)) return;
			depth++;
			setOver(true);
		}
		function move(e: DragEvent) {
			if (!hasFiles(e)) return;
			// Without this the browser opens the file in place of the app.
			e.preventDefault();
			e.dataTransfer!.dropEffect = "copy";
		}
		function leave(e: DragEvent) {
			if (!hasFiles(e)) return;
			depth = Math.max(0, depth - 1);
			if (!depth) setOver(false);
		}
		function drop(e: DragEvent) {
			if (!hasFiles(e)) return;
			e.preventDefault();
			depth = 0;
			setOver(false);
			const files = [...(e.dataTransfer?.files ?? [])];
			if (files.length) latest.current(files);
		}
		window.addEventListener("dragenter", enter);
		window.addEventListener("dragover", move);
		window.addEventListener("dragleave", leave);
		window.addEventListener("drop", drop);
		return () => {
			window.removeEventListener("dragenter", enter);
			window.removeEventListener("dragover", move);
			window.removeEventListener("dragleave", leave);
			window.removeEventListener("drop", drop);
		};
	}, []);

	return over;
}
