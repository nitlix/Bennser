"use client";

import s from "./FontSizeSlider.module.scss";

export const FONT_SIZES = { min: 0.75, max: 1.25, step: 0.0625 } as const;

type Props = { value: number; onChange: (value: number) => void };

/** Small "A ── A" (small to large) range for the source font size (rem). */
export default function ({ value, onChange }: Props) {
	return (
		<label className={s.slider} title="Source font size">
			<span className="text-[.7rem]">A</span>
			<input
				type="range"
				min={FONT_SIZES.min}
				max={FONT_SIZES.max}
				step={FONT_SIZES.step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				aria-label="Source font size"
			/>
			<span className="text-[1rem]">A</span>
		</label>
	);
}
