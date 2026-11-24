import { LuGithub } from "react-icons/lu";
import { plateClassName } from "@/components/(buttons)/ButtonBase";
import { GITHUB_URL } from "@/var/vars";

/** Icon plate linking to the repo, styled like the other toolbar buttons. */
export default function () {
	return (
		<a
			href={GITHUB_URL}
			target="_blank"
			rel="noreferrer"
			aria-label="Bennser on GitHub"
			title="View on GitHub"
			className={plateClassName({ icon: true })}
		>
			<LuGithub size={16} />
		</a>
	);
}
