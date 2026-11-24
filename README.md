# Bennser

Bennett's University of Manchester RISC-V dialect, running anywhere: as a CLI and in the browser.

```
packages/core   bug-compatible TS port of the Manchester RV32 emulator + COMP15111 ecalls + KMD parser
packages/asm    upstream Manchester assembler compiled to WASM (single-file ESM, no native deps)
packages/cli    `bennser run prog.s` / `bennser asm prog.s`
apps/web        in-browser visualiser (NNT template / vinext): datapath, registers, memory, step back
tests/          differential tests vs. the upstream C++ (native build)
upstream/       Bennett source mirror (git-ignored, see NOTES.md)
```

## Setup

Requires [Bun](https://bun.com), it's the package manager, script runner and the CLI's runtime. Don't purely rely on a npm/node installation.

```bash
curl -fsSL https://bun.sh/install | bash   # if you don't have it
bun install
bun run build:asm      # optional: prebuilt WASM is committed; rebuilding needs emscripten
bun run build:oracle   # native reference binaries for tests (clang++)
bun run test
```

## Web visualiser

```bash
bun run --cwd apps/web dev    # http://localhost:3000
```

Run assembles and goes straight to the end (or the next breakpoint). Click a line number in the editor to set a breakpoint.
Keys: ⌘↵ run, → step, ← step back, space run/pause. Panels can be hidden from the View menu, dragged by their title to rearrange, and resized by dragging the gaps.

## CLI

```bash
bun packages/cli/src/index.ts run tests/programs/hello.s
echo "hi" | bun packages/cli/src/index.ts run tests/programs/echo_upper.s
bun packages/cli/src/index.ts run prog.s --trace --regs
bun packages/cli/src/index.ts asm prog.s -o prog.kmd
```

See [NOTES.md](NOTES.md) for the dialect, the ecall table and every emulator quirk we reproduce.
