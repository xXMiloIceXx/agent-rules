---
trigger: glob
globs: "**/*.c, **/*.cc, **/*.cpp, **/*.cxx, **/*.h, **/*.hpp, CMakeLists.txt, Makefile"
description: "C / C++ conventions. Lifetime and undefined behaviour are the primary risks."
---

# C / C++

## Discover first

Read the build system (`CMakeLists.txt`, `Makefile`, `meson.build`) for the language standard
(`-std=`), warning flags and test setup. Match it rather than guessing. Determine the owning module
before editing a header — a header change ripples through every translation unit that includes it.

## Conventions

- **Lifetime is the primary risk.** State ownership explicitly: who allocates, who frees, and
  whether a pointer is borrowed or owned. Prefer RAII and smart pointers over raw `new` / `delete`.
- No undefined behaviour "because it works today": out-of-bounds access, signed overflow,
  use-after-free, uninitialised reads, strict-aliasing violations.
- Check every call that can fail (`malloc`, `fopen`, syscalls, I/O). Do not discard `errno`.
- `size_t` for sizes; `std::size` / `std::array` where they remove a hand-rolled bound.
- Fixed-width types from `<cstdint>` for anything crossing a boundary or a wire format.
- `const`-correctness throughout; pass by `const&` unless ownership transfers.
- Guard headers with `#pragma once` or include guards, matching the surrounding code.
- In C, prefer `static` for internal linkage and keep opaque types opaque.
- Avoid macros where an `inline` function or `constexpr` will do.

## Commands — discover first

```bash
cmake -S . -B build && cmake --build build -j
ctest --test-dir build --output-on-failure
# or: make -j && make check
```

Run `clang-tidy` or `cppcheck` only if the project already configures them.
