import { twMerge } from "tailwind-merge";
import s from "./ButtonBase.module.scss";

export type ButtonProps = React.JSX.IntrinsicElements["button"] & {
	size?: "default" | "small";
	/** Square, icon-only button. */
	icon?: boolean;
	tone?: "neutral" | "amber" | "sky";
};

type PlateOptions = Pick<ButtonProps, "size" | "icon" | "tone" | "className">;

/** The plate's classes, for elements that must not be a <button> (e.g. links). */
export function plateClassName({
	size = "default",
	icon,
	tone = "neutral",
	className,
}: PlateOptions) {
	return twMerge(
		s.button,
		size === "small" && s.small,
		icon && s.icon,
		tone !== "neutral" && s[tone],
		className,
	);
}

export default function ({
	children,
	className,
	size,
	icon,
	tone,
	type = "button",
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			className={plateClassName({ size, icon, tone, className })}
			{...props}
		>
			{children}
		</button>
	);
}
