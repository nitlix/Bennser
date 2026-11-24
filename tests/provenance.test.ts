/**
 * The committed WASM must say which upstream commits it was built from,
 * and those must match upstream.lock.json.
 */
import { expect, test } from "bun:test";
import { join } from "path";

const root = join(import.meta.dir, "..");

test("committed wasm matches upstream.lock.json", async () => {
	const lock = await Bun.file(join(root, "upstream.lock.json")).json();
	for (const name of ["riscvasm.js", "riscvasm.web.js"]) {
		const head = (
			await Bun.file(join(root, "packages/asm/wasm", name)).text()
		).slice(0, 400);
		expect(head).toContain(`// bennett     ${lock.bennett.commit}`);
		expect(head).toContain(`// riscv_tools ${lock.riscv_tools.commit}`);
	}
});
