#include "rva_platform.hpp"
std::pair<std::filesystem::path, std::error_code> getexepath() { return {std::filesystem::path("/"), {}}; }
