; Recursive factorial with a stack frame
        li sp, 0x8000           ; set up the stack
        li a0, 6
        call fact               ; a0 = 6!

        li a7, 3
        ecall
        li a7, 5
        ecall

fact    addi sp, sp, -8         ; push ra and n
        sw ra, 4[sp]
        sw a0, 0[sp]
        li t0, 1
        ble a0, t0, base
        addi a0, a0, -1
        call fact               ; a0 = (n-1)!
        lw t1, 0[sp]            ; restore n
        mul a0, a0, t1
        j done
base    li a0, 1
done    lw ra, 4[sp]
        addi sp, sp, 8
        ret
