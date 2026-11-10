; read chars until newline, echo them uppercased, then print the count
        li s0, 0                ; count
loop    li a7, 1
        ecall                   ; a0 = getchar
        li t0, 10
        beq a0, t0, done
        li t0, 'a'
        blt a0, t0, out
        li t0, 'z'
        bgt a0, t0, out
        addi a0, a0, -32
out     li a7, 0
        ecall
        addi s0, s0, 1
        j loop
done    li a0, 10
        li a7, 0
        ecall
        mv a0, s0
        li a7, 3
        ecall
        li a7, 5
        ecall
