# Bennser - RE notes

## Where the real code is

Bennett (`upstream/`) is mostly a Qt GUI shell. The RISC-V bits that matter live in the
`riscv_tools` submodule (`upstream/src/Libs/riscv_tools`, Jim Garside / Pavlos Petoumenos), which has **no Qt dependency**:

| Part              | File                              | Size        | Notes                                                                                     |
| ----------------- | --------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Assembler (`rva`) | `assembler/rva.cpp` + `mnemonics` | ~4.3k lines | From Garside's ARM assembler. Emits `.kmd` listing. **This is the "Manchester flavour".** |
| Emulator core     | `emulator/RV32.cpp`               | ~600 lines  | RV32IM, single-step `delta()`                                                             |
| COMP15111 ecalls  | `emulator/15111_handler.cpp`      | 90 lines    | syscall table below                                                                       |
| Disassembler      | `diss/riscvdis.cpp`               | ~1k lines   |                                                                                           |

Bennett runs the emulator as a **separate process** (`src/Modules/RISCV/emulator_frontend`) and talks to it over a binary
stdin/stdout protocol (mem/reg read/write, run/step/stop/reset). It assembles by shelling out to `riscvasm -lk`.

## Local builds (no cmake needed)

- `build-native/riscvasm`: the upstream assembler. The macOS path in `rva_platform.cpp` doesn't compile, so it's stubbed (`build-native/platform_stub.cpp`). Its output is byte-identical to upstream's `test/data/ecall_stop.kmd`.
- `build-native/rvrun`: a headless runner (`oracle/run.cpp`) around the real `RV32.cpp`. It loads a KMD, maps ecall I/O to stdio, and prints registers as JSON on stderr.

```bash
build-native/riscvasm prog.s -lk prog.kmd && build-native/rvrun prog.kmd
```

These two are the **oracle** for differential-testing our port.

## Assembler dialect (what makes it Manchester-only)

- `;` comments. Labels can appear with or without a colon (`msg defb ...`, `loop: ...`).
- **Base addressing uses square brackets**: `lw a0, 4[a1]`, `lw a0, [a1]`. GNU `4(a1)` is a **syntax error** ("Operator expected"), because `(` is parsed as an expression paren.
- `lw a0, label` is a PC-relative "global" pseudo (auipc + lw). Stores take `sw a0, label, t0`.
- ARM-style directives: `defb/dcb`, `defh/dcw`, `defw/dcd`, `defs`, `equ`, `org`, `align`, `include/get`, `if/else/endif`, `set/define`, `literal/pool/ltorg`, `record/struct`, `alias/byte/half/word`.
- Local labels with `%b` / `%f` references (ARM style).
- Standard pseudos: `li la lla call tail nop ret j jr mv not neg seqz snez beqz bnez bgt ble bgtu bleu csrr csrw rdcycle rdinstret …`
- Mnemonics containing `.` (`fence.i`, `lr.w`, `amoadd.w`, …) are **silently dropped** in the embedded-mnemonics build (cmake regex `[A-Za-z0-9_]+`).
- KMD output: `ADDR: HEX ; source line`, then a symbol table.

## Ecalls (COMP15111 handler, selector in `a7`)

| a7    | Effect                                                                          |
| ----- | ------------------------------------------------------------------------------- |
| 0     | putchar(a0 & 0xFF). **Stalls** if the out FIFO already holds more than 15 bytes |
| 1     | a0 = getchar(). Stalls until input is available                                 |
| 2     | print the NUL-terminated string at a0, **max 128 chars**                        |
| 3     | print a0 as signed decimal                                                      |
| 5     | stop (status `StoppedHardwareReq` = 0x45)                                       |
| other | unhandled → `ecall_stall`, so the CPU hangs retrying forever                    |

## Emulator quirks (verified on the real core)

- Memory: 0x100000 words (4 MiB), word-addressed internally, PC resets to 0, everything zeroed. Out-of-range reads return `0xDEADBEFF`, and out-of-range writes are ignored.
- **Unaligned word load** reads the containing word and shifts it right, zero-filled. `lw` at `addr+1` of `0x80FF1234` gives `0x0080FF12`. No trap.
- **`srai x, neg, 0` returns `0xFFFFFFFF`**: the sign mask is `0xFFFFFFFF << (32-0)`, and the host CPU masks the shift count. Shift amounts generally behave mod 32 (C++ UB that happens to work).
- **DIV/REM by zero halts the CPU** with `division_by_zero = true` and leaves rd unchanged. The spec says return -1 / rs1. `INT_MIN / -1` is UB in the C++ code (it traps on x86).
- CSR immediate forms use `(IR>>15) & 0xFFF` instead of `& 0x1F` (bug). The CSRRW "read only if rd≠0" check tests the wrong bits.
- **`mulhsu` / `mulhu` behave exactly like `mulh`**: both operands are sign-extended by the int32 → (unsigned) long long casts.
- **`jalr` writes rd before reading rs1**, so `jalr ra, 0[ra]` jumps to the _new_ ra (the next instruction).
- `srli x, neg, 0` returns 0 (same mask bug as srai).
- `LWU` (RV64) is accepted on RV32. Load funct3 3/7 don't mask.
- Unknown or FP/atomic opcodes are **silent NOPs**.
- JALR doesn't clear bit 0, and the PC is only masked on external writes.
- EBREAK sets `ebreak_stall` (the frontend decides what to do).
- Breakpoints are checked _after_ each instruction (PC match).
- `minstret` (0xB00) and `instret`/`instreth` count instructions.

## Proposed architecture

```
packages/
  core/      TS: RV32 emulator (bug-compatible), ecall handlers, KMD parser, step API + trace events
  asm/       assembler. Phase 1: rva.cpp → WASM (emscripten); phase 2: optional TS port
  cli/       `bennser run prog.s` / `bennser asm prog.s -o prog.kmd` / `--trace` / `--regs`
  web/       Next.js visualiser: editor, register file + diff highlights, memory view, datapath flow, step/back
tests/
  diff/      fuzz + corpus: run each program through oracle (rvrun) vs core, compare regs/mem/output
```

- **Emulator → hand-port to TS.** It's small, and the visualiser needs per-step hooks (reads/writes/branch taken) that the C++ core doesn't expose. Use `Math.imul`, `>>>`, and `& 31` to reproduce the quirks above deliberately.
- **Assembler → compile to WASM first.** It's 4.3k lines of dense two-pass Garside code where every edge case is the "Manchester flavour". WASM gives 100% fidelity on day one, and a TS port can come later, guarded by the diff tests.
