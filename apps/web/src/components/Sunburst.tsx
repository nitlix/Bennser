import { twMerge } from "tailwind-merge";

// Eight rounded rays around an empty core, in a 100×100 box.
const RAYS = Array.from({ length: 8 }, (_, i) => {
	const a = (i * Math.PI) / 4;
	const [c, s] = [Math.cos(a), Math.sin(a)];
	return {
		x1: 50 + c * 21,
		y1: 50 + s * 21,
		x2: 50 + c * 44,
		y2: 50 + s * 44,
	};
});

export default function ({
	className,
	...props
}: React.JSX.IntrinsicElements["svg"]) {
	return (
		<svg
			viewBox="0 0 100 100"
			fill="none"
			stroke="currentColor"
			strokeWidth={11}
			strokeLinecap="round"
			aria-hidden
			className={twMerge("size-[1.25rem] shrink-0", className)}
			{...props}
		>
			{RAYS.map((r, i) => (
				<line key={i} {...r} />
			))}
		</svg>
	);
}
