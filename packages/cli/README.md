# bennser

Run University of Manchester (Bennett) RISC-V assembly from the command line, on any machine with Node or Bun. No VPN, no Qt, no Bennett install.

- The **assembler** is the upstream Bennett assembler compiled to WebAssembly, so it accepts and rejects exactly what Bennett does.
- The **emulator** is a TypeScript port that is bug-compatible with Bennett's RV32IM core and COMP15111 ecalls.

There's also an in-browser visualiser: [Bennser Web](https://bennser.nitlix.com).

## Usage

One-line install (installs Bun first if needed; re-run to update):

```bash
curl -fsSL https://bennser.nitlix.com/install | bash        # macOS / Linux
powershell -c "irm bennser.nitlix.com/install.ps1|iex"     # Windows
```

Or straight from npm:

```bash
npx bennser run prog.s            # or: bunx bennser run prog.s
npm i -g bennser && bennser run prog.s
```

```
bennser run <file.s|file.kmd> [options]   assemble (if needed) and run
bennser asm <file.s> [-o out.kmd]         assemble to KMD

  -i, --input <text>     ecall input (default: stdin)
  -r, --regs             print registers when the program stops
  -t, --trace            print every instruction with register/memory changes
  -m, --max-steps <n>    step limit (default 50,000,000)
  -v, --version
```

Program output (ecalls 0, 2, 3) goes to **stdout**. Traces, registers, errors and the stop reason go to **stderr**, so you can pipe or diff the program output cleanly:

```bash
echo "hello" | bennser run echo.s
bennser run prog.s -i 'abc\n' > out.txt
bennser run prog.s --trace --regs 2> trace.txt
```

### Exit codes

| Code | Meaning                                                                                       |
| ---- | --------------------------------------------------------------------------------------------- |
| 0    | Stopped via `ecall` 5                                                                         |
| 1    | Assembly error (printed as `file:line:col message`)                                           |
| 2    | Abnormal stop: division by zero, `ebreak`, unknown ecall, out of input, or the step limit hit |

## The dialect, briefly

- `;` comments, labels with or without a colon.
- Base addressing uses **square brackets**: `lw a0, 4[a1]`. The GNU form `4(a1)` is a syntax error.
- ARM-style directives: `defb`, `defw`, `defs`, `equ`, `org`, `align`, `include`, …
- `include` resolves files in the same directory as the source.

Ecalls (selector in `a7`): 0 putchar, 1 getchar, 2 print string at `a0`, 3 print `a0` as signed decimal, 5 stop.

```asm
        la   a0, msg
        li   a7, 2
        ecall
        li   a7, 5
        ecall
msg     defb "Hello from Bennser!", 10, 0
```

Bennett's quirks are reproduced on purpose (for example `mulhu` behaves like `mulh`, DIV by zero halts). See [NOTES.md](https://github.com/nitlix/Bennser/blob/master/NOTES.md) for the full list.

## For agents

`bennser` is non-interactive and deterministic: pass input with `-i` or stdin, read the program's output from stdout and check the exit code. `--trace` gives one line per instruction with every register and memory write, which is useful for debugging a student's program step by step.

## License

Apache-2.0 for Bennser's own code. The bundled assembler is compiled from the University of Manchester's riscv_tools and stays under its authors' copyright; see NOTICE.
