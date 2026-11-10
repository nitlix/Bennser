; Print the first 12 Fibonacci numbers
        li s0, 0                ; a
        li s1, 1                ; b
        li s2, 12               ; counter

next    mv a0, s0
        li a7, 3
        ecall
        li a0, ' '
        li a7, 0
        ecall
        add t0, s0, s1
        mv s0, s1
        mv s1, t0
        addi s2, s2, -1
        bnez s2, next

        li a0, 10
        li a7, 0
        ecall
        li a7, 5
        ecall
