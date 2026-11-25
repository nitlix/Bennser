"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useState backed by localStorage (JSON). It starts at `initial` so server and client render
 * the same, then loads the saved value after mount. Saved values that fail `valid` are ignored.
 */
export function useStored<T>(
	key: string,
	initial: T,
	valid: (value: unknown) => boolean,
) {
	const [value, setValue] = useState<T>(initial);

	useEffect(() => {
		try {
			const raw = localStorage.getItem(key);
			if (raw === null) return;
			const saved: unknown = JSON.parse(raw);
			if (valid(saved)) setValue(saved as T);
		} catch {}
	}, [key]);

	const set = useCallback(
		(next: T) => {
			setValue(next);
			localStorage.setItem(key, JSON.stringify(next));
		},
		[key],
	);

	return [value, set] as const;
}
