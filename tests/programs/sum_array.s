; Sum an array in memory and print the total
        la s0, numbers          ; s0 -> first element
        li s1, 6                ; s1 = count
        li a0, 0                ; a0 = running total

loop    lw t0, [s0]             ; load element (Manchester syntax: [reg])
        add a0, a0, t0
        addi s0, s0, 4          ; next word
        addi s1, s1, -1
        bnez s1, loop

        li a7, 3                ; print decimal
        ecall
        li a7, 5                ; stop
        ecall

numbers defw 12, -3, 40, 7, 100, 9
