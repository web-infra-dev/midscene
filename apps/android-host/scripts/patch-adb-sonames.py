#!/usr/bin/env python3
"""Stage the bundled `adb` binary and its libraries into jniLibs.

Android packages only `*.so` entries from jniLibs and the linker matches
DT_NEEDED by file name, so two things have to happen before the files land
there:

  - versioned names (`libz.so.1`, `libzstd.so.1`) become plain `*.so` names,
    otherwise AGP silently drops them and `adb` cannot start;
  - they must not collide with the Node runtime's libraries, which live in the
    same directory. `libz.so.1` is exactly as long as `libz_1.so`, so the
    rewrite stays inside the existing string table (see patch-elf-sonames.py)
    and Node keeps its own `libz.so`.

`libc++_shared.so` is deliberately not copied: the Node runtime already ships
one and it is ABI-compatible with this `adb` build (verified on device).
"""
import importlib.util
import os
import shutil
import sys

# Importing the Node patcher below would otherwise drop a __pycache__ into the
# scripts directory on every run.
sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))

# Reuse the ELF rewriting from the Node script: the version-need section has to
# be rewritten together with DT_NEEDED, and that lesson should live in one place.
_spec = importlib.util.spec_from_file_location(
    'patch_elf_sonames', os.path.join(HERE, 'patch-elf-sonames.py')
)
_patcher = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_patcher)

# old soname -> new file name (never longer than the old one)
RENAMES = {
    'libz.so.1': 'libz_1.so',
    'libzstd.so.1': 'libzstd.so',
}

# Files in the staging directory, in the name they arrive under.
FILE_RENAMES = {
    'libz.so.1.3.2': 'libz_1.so',
    'libzstd.so.1.5.7': 'libzstd.so',
}

# Copied under their own name. libc++_shared.so is handled by the Node runtime.
PLAIN = (
    'libbrotlicommon.so',
    'libbrotlidec.so',
    'libbrotlienc.so',
    'liblz4.so',
    'libprotobuf.so',
    'libutf8_range.so',
    'libutf8_validity.so',
)


def main():
    source = sys.argv[1]
    target = sys.argv[2]

    os.makedirs(target, exist_ok=True)

    adb_src = os.path.join(source, 'adb')
    adb_dst = os.path.join(target, 'libadbbin.so')
    if not os.path.isfile(adb_src):
        raise SystemExit(f'no adb binary at {adb_src}')
    shutil.copy2(adb_src, adb_dst)
    os.chmod(adb_dst, 0o755)
    print(f'adb          -> libadbbin.so  {os.path.getsize(adb_dst) / 1024 / 1024:6.2f} MB')

    libs = os.path.join(source, 'lib')
    copied = 0
    for src_name, dst_name in FILE_RENAMES.items():
        src = os.path.join(libs, src_name)
        if not os.path.isfile(src):
            raise SystemExit(f'missing {src}')
        shutil.copy2(src, os.path.join(target, dst_name))
        print(f'{src_name:28s} -> {dst_name:16s}')
        copied += 1

    for name in PLAIN:
        src = os.path.join(libs, name)
        if not os.path.isfile(src):
            raise SystemExit(f'missing {src}')
        shutil.copy2(src, os.path.join(target, name))
        copied += 1

    for name in sorted(os.listdir(libs)):
        if name.startswith('libabsl_') and name.endswith('.so'):
            shutil.copy2(os.path.join(libs, name), os.path.join(target, name))
            copied += 1

    if copied == 0:
        raise SystemExit('no libraries staged')

    _patcher.RENAMES = RENAMES
    print(f'--- staged {copied} libraries, patching DT_NEEDED ---')
    rewritten = 0
    for name in sorted(os.listdir(target)):
        if not name.endswith('.so'):
            continue
        counted = _patcher.patch(os.path.join(target, name))
        if counted:
            print(f'  {name:28s} {counted} entries rewritten')
        rewritten += counted
    if rewritten == 0:
        raise SystemExit('no sonames were rewritten; the rename map is stale')
    print(f'--- {rewritten} soname entries rewritten ---')


if __name__ == '__main__':
    main()
