import ButtonBase, {
	type ButtonProps,
} from "@/components/(buttons)/ButtonBase";

/** Filled amber plate for the one action you are meant to press. */
export default function ({ children, tone = "amber", ...props }: ButtonProps) {
	return (
		<ButtonBase tone={tone} {...props}>
			{children}
		</ButtonBase>
	);
}
