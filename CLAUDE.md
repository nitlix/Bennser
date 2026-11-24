# Bennser: internal development notes

Bennser runs the University of Manchester (Bennett) RISC-V dialect anywhere: as a Bun CLI and as an in-browser visualiser ("Bennser Web").
It has two halves. The **assembler** is the upstream C++ compiled to WASM, so it matches upstream exactly. The **emulator** is a hand port to TS that is **bug-compatible** with the upstream C++ core.
NOTES.md is the long-form reverse-engineering log. README.md is the user-facing doc. Keep both in sync with this file when facts change.

## Before every commit (mandatory)

1. **`bun fmt`**: format everything. CI runs `bun fmt --check` and fails on any unformatted file. Bun's formatter is configured in `bunfig.toml` (tabs, width 4); `packages/asm/wasm/*.js` is excluded in `.prettierignore`.
2. `bun run test`
3. `bun run typecheck`. This covers only `packages/*/src` and `tests`; the web app is checked separately with `bunx tsc --noEmit -p apps/web`.
4. If `apps/web` changed: `bun run --cwd apps/web build`.

CI (`.github/workflows/ci.yml`, every push and PR) runs, in order: `bun install --frozen-lockfile`, `bun fmt --check`, `bun run test`, then the web build. It stops at the first failure, so an unformatted file hides test or build failures.

Commits go to `master`, and **a push to master deploys** the web app. Commit-message style: `feat(web): …`, `chore(asm): …`, `style: …`, `ci: …`, and so on. End each message with the attribution line from the global instructions.

## Commands

All commands run from the repo root. Use bun everywhere, never npm or npx.

| Command                                                | What it does                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `bun dev`                                              | Web dev server (vinext) at http://localhost:3000. `.claude/launch.json` has the same server as `web`.         |
| `bun run test`                                         | `bun test tests/`                                                                                             |
| `bun run typecheck`                                    | tsc over packages and tests                                                                                   |
| `bun run sync`                                         | Fetch latest Bennett, pin it in `upstream.lock.json`, rebuild WASM + native oracle, run tests. Needs uni VPN. |
| `bun run sync --tools origin/main`                     | Use unreleased riscv_tools instead of Bennett's pinned submodule                                              |
| `bun run sync --locked` / `--ref <r>` / `--no-build`   | Reproduce the pin exactly / pick a Bennett ref / fetch and lock only                                          |
| `bun run build:asm`                                    | Rebuild `packages/asm/wasm/*.js` (needs emscripten and a matching `upstream/`)                                |
| `bun run build:oracle`                                 | Build `build-native/riscvasm` + `build-native/rvrun` (clang++)                                                |
| `bun run build:favicon`                                | Regenerate `apps/web/public/favicon.ico` from `scripts/build-favicon.ts`                                      |
| `bun packages/cli/src/index.ts run prog.s`             | CLI run. Flags: `-i/--input`, `-r/--regs`, `-t/--trace`, `-m/--max-steps` (default 50,000,000)                |
| `bun packages/cli/src/index.ts asm prog.s -o prog.kmd` | CLI assemble to KMD                                                                                           |

## Repo layout

```
packages/core   @bennser/core: TS RV32 emulator (bug-compatible), COMP15111 ecalls, KMD parser, Machine (step/run/undo + traces)
packages/asm    @bennser/asm: upstream assembler → WASM. "." = node/bun build, "./browser" = web build. build.ts compiles it.
packages/cli    `bennser` bin: run / asm
apps/web        @bennser/web: Next.js App Router on vinext (Vite) → Cloudflare Workers (wrangler name "bennser-web")
tests/          diff.test.ts (vs native oracle), provenance.test.ts (wasm ↔ lock), undo.test.ts; programs/*.s fixtures
scripts/        sync-upstream.ts, build-favicon.ts
oracle/run.cpp  headless runner around the real RV32.cpp, used for differential tests
upstream/       Bennett checkout (git-ignored), pinned by upstream.lock.json
build-native/   native oracle binaries (git-ignored)
```

### Packages

- **core** (`packages/core/src`): `RV32.ts` (CPU), `decode.ts`, `registers.ts`, `comp15111.ts` (ecall handler), `kmd.ts` (KMD parser), `Machine.ts`.
  `Machine` wraps `new RV32([comp15111])` and provides `loadKmd(text)`, `input(text|bytes)`, `step()`, `run`, `pause()`, `undo()` and `reg(n)`. It keeps a bounded `history` of `{ trace, before }` entries for step-back. Stop reasons include `stopped`, `div-by-zero`, `breakpoint`, `ebreak`, `waiting-input`, `stalled` and `step-limit`.
- **asm**: `assemble(source, opts)` resolves to `{ ok, kmd }` or an error `log` plus `AssembleError`s. `packages/asm/wasm/riscvasm*.js` is **generated and committed**, and its header stamps the bennett and riscv_tools commits. `provenance.test.ts` checks those stamps against `upstream.lock.json`. **Never hand-edit the wasm JS.** Rebuild it through `sync` / `build:asm`, which refuse to build from a tree that doesn't match the lock.
- **Upstream pin** (`upstream.lock.json`): Bennett `gitlab.cs.man.ac.uk/cadtools/bennett.git` and riscv_tools `…/cadtools/riscv_tools.git`. These are only reachable on the campus network or the VPN.

### Tests

- `diff.test.ts` runs every program through both the oracle (`rvrun` + native `riscvasm`) and our TS core + WASM assembler, then compares output, PC and registers. **It skips itself when `build-native/` is missing** (always in CI).
- `undo.test.ts` checks that undo rewinds every step exactly: PC, registers, memory, output, input FIFO and instruction count.
- When adding emulator behaviour, add a program to `tests/programs/` (with a matching `.in` file if it reads input) so the diff tests cover it.

## Emulator rules

**Reproduce upstream bugs deliberately. Never "fix" them to match the RISC-V spec.** Fidelity to what students see in Bennett is the whole point. Use `Math.imul`, `>>>` and `& 31` to get the C++ behaviour. If upstream fixes something, port the fix after `sync` and let the diff tests confirm it.

### Where the upstream code is

Bennett is a Qt GUI shell. The parts that matter are in the `riscv_tools` submodule (`upstream/src/Libs/riscv_tools`, by Jim Garside and Pavlos Petoumenos), which doesn't use Qt:

| Part              | File                              | Notes                                                                           |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| Assembler (`rva`) | `assembler/rva.cpp` + `mnemonics` | ~4.3k lines, from Garside's ARM assembler. This defines the Manchester flavour. |
| Emulator core     | `emulator/RV32.cpp`               | ~600 lines, RV32IM, single-step `delta()`                                       |
| COMP15111 ecalls  | `emulator/15111_handler.cpp`      | 90 lines                                                                        |
| Disassembler      | `diss/riscvdis.cpp`               | ~1k lines                                                                       |

Bennett runs the emulator as a separate process that talks a binary stdin/stdout protocol, and it assembles by running `riscvasm -lk`. The native `riscvasm` needs `platform_stub.cpp`, because the macOS path in `rva_platform.cpp` doesn't compile.

### Assembler dialect

- `;` starts a comment. Labels may or may not have a colon (`msg defb …`, `loop: …`).
- **Base addressing uses square brackets**: `lw a0, 4[a1]`, `lw a0, [a1]`. The GNU form `4(a1)` is a syntax error ("Operator expected").
- `lw a0, label` is a PC-relative pseudo (auipc + lw). A store to a label takes a temp register: `sw a0, label, t0`.
- Directives are ARM-style: `defb/dcb`, `defh/dcw`, `defw/dcd`, `defs`, `equ`, `org`, `align`, `include/get`, `if/else/endif`, `set/define`, `literal/pool/ltorg`, `record/struct`, `alias/byte/half/word`.
- Local labels use `%b` / `%f` references.
- Standard pseudos are available: `li la lla call tail nop ret j jr mv not neg seqz snez beqz bnez bgt ble bgtu bleu csrr csrw rdcycle rdinstret …`
- Mnemonics with a `.` in them (`fence.i`, `lr.w`, `amoadd.w`, …) are **silently dropped** in the embedded-mnemonics build.
- The KMD output is `ADDR: HEX ; source line` lines followed by a symbol table.

### Ecalls (COMP15111; the selector is in `a7`)

| a7    | Effect                                                                              |
| ----- | ----------------------------------------------------------------------------------- |
| 0     | putchar(a0 & 0xFF). **Stalls** if the output FIFO already holds more than 15 bytes. |
| 1     | a0 = getchar(). Stalls until input is available (the web shows "waiting-input").    |
| 2     | Prints the NUL-terminated string at a0, **max 128 chars**.                          |
| 3     | Prints a0 as a signed decimal.                                                      |
| 5     | Stops (status `StoppedHardwareReq` = 0x45).                                         |
| other | Unhandled: `ecall_stall`, and the CPU retries forever ("stalled").                  |

### Quirks to reproduce (verified on the real core)

- Memory is 0x100000 words (4 MiB), word-addressed internally, all zeroed, and the PC resets to 0. Out-of-range reads return `0xDEADBEFF`; out-of-range writes are ignored.
- An **unaligned word load** reads the containing word shifted right with zero fill: `lw` at `addr+1` of `0x80FF1234` gives `0x0080FF12`. There is no trap.
- **`srai x, neg, 0` gives `0xFFFFFFFF`**, and `srli x, neg, 0` gives 0. Shift amounts otherwise behave mod 32.
- **DIV/REM by zero halts the CPU** (`division_by_zero`) and leaves rd unchanged. `INT_MIN / -1` is undefined behaviour in the C++.
- The CSR immediate forms mask with `(IR>>15) & 0xFFF` instead of `& 0x1F`. The CSRRW "read only if rd≠0" check tests the wrong bits.
- **`mulhsu` and `mulhu` behave exactly like `mulh`**, because both operands get sign-extended.
- **`jalr` writes rd before it reads rs1**, so `jalr ra, 0[ra]` jumps to the _new_ ra.
- `LWU` (an RV64 instruction) is accepted on RV32, and load funct3 3/7 don't mask.
- Unknown, floating-point and atomic opcodes are **silent NOPs**.
- JALR doesn't clear bit 0, and the PC is only masked on external writes.
- EBREAK sets `ebreak_stall`. Breakpoints are checked _after_ each instruction, by matching the PC.
- `minstret` (0xB00) and `instret`/`instreth` count instructions.

## Web app (`apps/web`)

- **Stack:** Next.js App Router running on **vinext** (Vite + RSC) and deployed to Cloudflare Workers (`wrangler.jsonc`, `vite.config.ts` adds the cloudflare plugin only for build). Styling is Tailwind v4 plus SCSS modules. Theming uses `next-themes` and `src/backbone/themes.scss`, with dark mode keyed off `[data-theme="dark"]`. Metadata comes from `nitlix-metagen`. There is no database and no RPC worker. `DISABLE_VINEXT.md` explains how to go back to plain Next.
- `apps/web/FOR_AGENTS.md` is **stale template boilerplate** (it mentions i18n, Drizzle and pnpm, none of which exist here). Don't trust it.
- **One page:** `src/app/(main)/page.tsx` renders `<Workbench />`. Its title is **"Bennser Web"**, and the layout default title is the same.
- **Workbench** (`src/components/workbench/`):
    - `Workbench.tsx` puts it together and saves the source and breakpoints in localStorage (`bennser:source`, `bennser:breakpoints`).
    - `useMachine.ts` owns the `Machine` and lazy-imports `@bennser/asm/browser`. Run speeds are in `SPEEDS`, and the run modes are `fast` and `animate`.
    - `useLayout.ts` holds the dockable panel layout (`PANELS`: source, code, datapath, console, registers, memory). It's columns of cells and is saved under `bennser:layout`. **Bump `version` if you change its shape.**
    - `Dock.tsx` handles drag and drop (MIME `application/x-bennser-panel`) and resizing.
    - Panels: `SourceEditor`, `Listing` (machine code), `Datapath` (+ `datapathFlow.ts`), `Console`, `Registers`, `MemoryView`.
    - `Toolbar.tsx` has the logo, the examples menu (`examples.ts`), run, step and back, speed, the View menu, the status pill and the theme switch.
    - `highlight.ts` does syntax highlighting.
- **Keyboard shortcuts:** ⌘↵ runs, → steps, ← steps back, space toggles run/pause. Clicking a line number toggles a breakpoint.
- **Branding:**
    - `components/Logo.tsx` is the `<Sunburst />` plus an uppercase "BENNSER" wordmark in **Montserrat 700**, a local variable woff2 in `src/fonts/Montserrat`. The rest of the UI uses **Geist**. Size the logo with `text-[…rem]`, because the burst scales in `em`.
    - `components/Sunburst.tsx` draws 8 round-capped rays (radius 21→44 in a 100×100 box, stroke 11) in `currentColor`.
    - The favicon is a black rounded tile with a white sunburst, generated by `scripts/build-favicon.ts` with no dependencies (SDF rasteriser → PNG → ICO, sizes 16–256). Change the geometry there and rerun `bun run build:favicon`. **Don't hand-edit the .ico.**
- **Buttons** (`components/(buttons)/`): `ButtonBase` plus `ButtonBase.module.scss` is the "plate", with a solid face, a 1px edge and a 3px bottom lip. It doesn't move on press; only the fill changes. The tones are neutral, amber and sky, and there's a small size and an icon size. For links styled as plates, use `plateClassName()` from `ButtonBase` on an `<a>` (see `GitHubButton.tsx`, which links to `GITHUB_URL` in `src/var/vars.ts`). `aria-expanded` gives the open-menu fill and `aria-pressed` the amber latched toggle. In dark mode, the hover and open fills are `color-mix`es between neutral-900 and neutral-800, so they **must never equal the edge/lip colour** (neutral-800), or the plate looks solid.
- **Dropdowns:** always use `workbench/Menu.tsx` + `MenuItem`. The chevron stays still (it doesn't rotate). `Menu.module.scss` handles the entrance: the panel fades in over 120ms, then each child fades in over 180ms, **25ms apart** (`$step`). It respects `prefers-reduced-motion`. Every menu gets this automatically.
- Other shared pieces: `PanelBase.tsx` (panel chrome with a draggable title), `PillBase.tsx`, `ThemeSwitcher.tsx`, and `BetterA.tsx`, which comes from the template's `src/backbone/Backbone.tsx` (Lenis smooth scroll and the navigate context).
- Follow the global NWS1 standards: rem units, `twMerge`, unnamed default exports, and SCSS modules for anything complex.
