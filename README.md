# Bennser

Bennett's University of Manchester RISC-V dialect, running anywhere: as a CLI and in the browser.

```
packages/core   bug-compatible TS port of the Manchester RV32 emulator + COMP15111 ecalls + KMD parser
packages/asm    upstream Manchester assembler compiled to WASM (single-file ESM, no native deps)
packages/cli    `bennser run prog.s` / `bennser asm prog.s`
apps/web        in-browser visualiser (NNT template / vinext): datapath, registers, memory, step back
tests/          differential tests vs. the upstream C++ (native build)
upstream/       Bennett checkout (git-ignored), pinned by upstream.lock.json
```

## Setup

Requires [Bun](https://bun.com), it's the package manager, script runner and the CLI's runtime. Don't purely rely on a npm/node installation.

```bash
curl -fsSL https://bun.sh/install | bash   # if you don't have it
bun install
bun run test
```

The prebuilt WASM is committed, so that's all you need. Upstream differential tests skip themselves unless the native oracle is built.

### Updating from Bennett

Bennett lives on the uni GitLab (campus network or VPN). The assembler is compiled from it; the emulator is a hand port, so emulator changes upstream need porting to `packages/core`.

```bash
bun run sync                       # latest Bennett: fetch, pin in upstream.lock.json, rebuild WASM + oracle, test
bun run sync --tools origin/main   # use unreleased riscv_tools fixes instead of Bennett's pinned version
bun run sync --locked              # reproduce the pinned build exactly (needs emscripten + clang++)
```

## Web visualiser

```bash
bun run --cwd apps/web dev    # http://localhost:3000
```

Run assembles and goes straight to the end (or the next breakpoint). Click a line number in the editor to set a breakpoint.
Keys: ⌘↵ run, → step, ← step back, space run/pause. Panels can be hidden from the View menu, dragged by their title to rearrange, and resized by dragging the gaps.

## CLI

Published on npm as [`bennser`](https://www.npmjs.com/package/bennser) (one bundled file, runs on Node ≥ 18.3 or Bun):

```bash
npx bennser run prog.s
```

From the repo:

```bash
bun packages/cli/src/index.ts run tests/programs/hello.s
echo "hi" | bun packages/cli/src/index.ts run tests/programs/echo_upper.s
bun packages/cli/src/index.ts run prog.s --trace --regs
bun packages/cli/src/index.ts asm prog.s -o prog.kmd
```

See [NOTES.md](NOTES.md) for the dialect, the ecall table and every emulator quirk we reproduce.

## License

[Apache-2.0](LICENSE) for Bennser's own code. It grants no rights to the Bennser name or logo. The assembler in `packages/asm/wasm/` is compiled from the University of Manchester's riscv_tools and is not covered; see [NOTICE](NOTICE).
