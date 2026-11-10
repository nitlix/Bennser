// Headless oracle: loads a KMD, runs upstream RV32 core, ecall I/O on stdio, dumps regs as JSON.
#include <cstdio>
#include <fstream>
#include <iostream>
#include <regex>
#include <sstream>
#include <string>
#include "RV32.hpp"
using namespace riscvemu;
int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: run file.kmd [maxSteps]\n"); return 2; }
  uint64_t maxSteps = argc > 2 ? std::stoull(argv[2]) : 10'000'000;
  riscv_t cpu;
  std::ifstream in(argv[1]);
  std::string line;
  std::regex re(R"(^([0-9A-Fa-f]{8}):\s+((?:[0-9A-Fa-f]{2,8}\s+)+);)");
  std::smatch m;
  while (std::getline(in, line)) {
    if (!std::regex_search(line, m, re)) continue;
    uint32_t addr = std::stoul(m[1], nullptr, 16);
    std::istringstream hs(m[2]); std::string h;
    while (hs >> h) {
      auto sz = h.size() == 8 ? data_size::WORD : h.size() == 4 ? data_size::HALF : data_size::BYTE;
      cpu.mem_write(sz, addr, std::stoul(h, nullptr, 16));
      addr += h.size() / 2;
    }
  }
  std::string input((std::istreambuf_iterator<char>(std::cin)), {});
  for (unsigned char c : input) cpu.fifo_push(c);
  cpu.signal_run = true;
  uint64_t steps = 0;
  while (steps < maxSteps) {
    cpu.delta();
    while (auto c = cpu.fifo_pop()) std::putchar(*c);
    if (cpu.status != ProcessorStatus::Running && cpu.status != ProcessorStatus::HandlingEcall && steps > 0) break;
    if (cpu.ecall_stall && cpu.fifo_in.empty() && cpu.reg_read(17) == 1) break; // waiting on input forever
    if (cpu.ebreak_stall) break;
    steps++;
  }
  std::fprintf(stderr, "{\"pc\":%u,\"steps\":%llu,\"status\":%d,\"divzero\":%d,\"x\":[", cpu.pc_read(), (unsigned long long)cpu.getCount(), (int)cpu.status, cpu.division_by_zero);
  for (int i = 0; i < 32; i++) std::fprintf(stderr, "%s%u", i ? "," : "", cpu.reg_read(i));
  std::fprintf(stderr, "]}\n");
}
