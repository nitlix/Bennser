import { expect, test } from "bun:test";
import { join } from "path";
import { assemble } from "@bennser/asm";
import { Machine } from "@bennser/core";

const state = (m: Machine) => ({
	pc: m.cpu.pc,
	regs: Array.from(m.cpu.registers),
	mem: Array.from(m.cpu.memory.subarray(0, 256)),
	out: [...m.output],
	fifoIn: [...m.cpu.fifoIn],
	count: m.cpu.instrCount,
});

for (const name of ["echo_upper.s", "hello.s"]) {
	test(`undo rewinds every step exactly (${name})`, async () => {
		const r = await assemble(
			await Bun.file(join(import.meta.dir, "programs", name)).text(),
		);
		if (!r.ok) throw new Error(r.log);

		const m = new Machine({ history: 10_000 });
		m.loadKmd(r.kmd);
		m.input("Hi there\n");

		const states = [state(m)];
		let reason = null;
		while (!reason) {
			reason = m.step();
			states.push(state(m));
		}
		expect(reason).toBe("stopped");

		for (let i = states.length - 2; i >= 0; i--) {
			m.undo();
			expect(state(m)).toEqual(states[i]!);
		}

		// And forwards again gives identical results.
		const rerun = m.run();
		expect(rerun.reason).toBe("stopped");
		expect(state(m)).toEqual(states.at(-1)!);
	});
}
