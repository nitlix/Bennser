import ButtonBase, {
	type ButtonProps,
} from "@/components/(buttons)/ButtonBase";

/** Neutral plate: white/neutral-900 face with a 1px edge. */
export default function ({ children, ...props }: ButtonProps) {
	return <ButtonBase {...props}>{children}</ButtonBase>;
}
