import ButtonBase, {
	type ButtonProps,
} from "@/components/(buttons)/ButtonBase";

/** Neutral plate: white/neutral-900 face, hairline, heavier bottom edge. */
export default function ({ children, ...props }: ButtonProps) {
	return <ButtonBase {...props}>{children}</ButtonBase>;
}
