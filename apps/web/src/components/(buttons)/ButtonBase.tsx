import { twMerge } from "tailwind-merge";
import s from "./ButtonBase.module.scss";

export type ButtonProps = React.JSX.IntrinsicElements["button"] & {
	size?: "default" | "small";
	/** Square, icon-only button. */
	icon?: boolean;
	tone?: "neutral" | "amber" | "sky";
};

export default function ({
	children,
	className,
	size = "default",
	icon,
	tone = "neutral",
	type = "button",
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			className={twMerge(
				s.button,
				size === "small" && s.small,
				icon && s.icon,
				tone !== "neutral" && s[tone],
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
