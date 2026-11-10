import { metaGen } from "nitlix-metagen";
import Workbench from "@/components/workbench/Workbench";

export const metadata = metaGen({
	title: "Bennser — Manchester RISC-V in your browser",
	description:
		"Assemble and step through University of Manchester (Bennett) RISC-V programs with a live datapath, registers and memory.",
});

export default async function () {
	return <Workbench />;
}
