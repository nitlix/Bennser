; hello world, Manchester style
        la a0, msg
        li a7, 2
        ecall
        li a0, -42
        li a7, 3
        ecall
        li a0, 10
        li a7, 0
        ecall
        li a7, 5
        ecall
msg     defb "Hello from Bennser!", 10, 0
