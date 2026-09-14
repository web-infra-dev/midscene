#!/usr/bin/env python3
"""Rewrite DT_NEEDED sonames in place (NUL-padded) so a bundle can live in an
APK's jniLibs directory, where Android's packaging only accepts *.so files and
the linker matches dependencies by file name."""
import os
import shutil
import struct
import sys

RENAMES = {
    'libz.so.1': 'libz.so',
    'libsqlite3.so': 'libsqlite3.so',
    'libicui18n.so.78': 'libicui18n.so',
    'libicuuc.so.78': 'libicuuc.so',
    'libicudata.so.78': 'libicudata.so',
    'libssl.so.3': 'libssl.so',
    'libcrypto.so.3': 'libcrypto.so',
}

FILE_RENAMES = {
    'libz.so.1.3.1': 'libz.so',
    'libsqlite3.so.3.53.4': 'libsqlite3.so',
    'libicui18n.so.78.3': 'libicui18n.so',
    'libicuuc.so.78.3': 'libicuuc.so',
    'libicudata.so.78.3': 'libicudata.so',
    'libssl.so.3': 'libssl.so',
    'libcrypto.so.3': 'libcrypto.so',
}


def patch(path):
    """Replace every occurrence of the old sonames inside .dynstr.

    DT_NEEDED and the version-need section reference the same string table but
    may point at different offsets, so rewriting only the DT_NEEDED entries
    leaves the linker with an inconsistent view ("cannot find X from verneed[0]
    in DT_NEEDED list").
    """
    with open(path, 'rb') as f:
        data = bytearray(f.read())
    if data[:4] != b'\x7fELF':
        return 0
    is64 = data[4] == 2
    end = '<' if data[5] == 1 else '>'
    if is64:
        e_phoff, = struct.unpack_from(end + 'Q', data, 0x20)
        e_phentsize, e_phnum = struct.unpack_from(end + 'HH', data, 0x36)
    else:
        e_phoff, = struct.unpack_from(end + 'I', data, 0x1C)
        e_phentsize, e_phnum = struct.unpack_from(end + 'HH', data, 0x2A)

    vaddr_map, dyn = [], None
    for i in range(e_phnum):
        off = e_phoff + i * e_phentsize
        p_type, = struct.unpack_from(end + 'I', data, off)
        if is64:
            p_offset, = struct.unpack_from(end + 'Q', data, off + 0x08)
            p_vaddr, = struct.unpack_from(end + 'Q', data, off + 0x10)
            p_filesz, = struct.unpack_from(end + 'Q', data, off + 0x20)
        else:
            p_offset, = struct.unpack_from(end + 'I', data, off + 0x04)
            p_vaddr, = struct.unpack_from(end + 'I', data, off + 0x08)
            p_filesz, = struct.unpack_from(end + 'I', data, off + 0x10)
        if p_type == 1:
            vaddr_map.append((p_vaddr, p_offset))
        elif p_type == 2:
            dyn = (p_offset, p_filesz)

    if dyn is None:
        return 0

    def to_offset(va):
        for va_start, off in vaddr_map:
            if va >= va_start and va - va_start < 64 * 1024 * 1024:
                return off + (va - va_start)
        return None

    strtab = strsz = None
    step = 16 if is64 else 8
    for off in range(dyn[0], dyn[0] + dyn[1], step):
        tag, val = (
            struct.unpack_from(end + 'qQ', data, off)
            if is64
            else struct.unpack_from(end + 'iI', data, off)
        )
        if tag == 0:
            break
        if tag == 5:
            strtab = val
        elif tag == 10:
            strsz = val

    if strtab is None or strsz is None:
        return 0

    start = to_offset(strtab)
    if start is None:
        return 0
    region = bytes(data[start:start + strsz])

    patched = 0
    for old, new in RENAMES.items():
        if old == new or len(new) > len(old):
            continue
        needle = old.encode() + b'\x00'
        replacement = new.encode() + b'\x00' + b'\x00' * (len(old) - len(new))
        count = region.count(needle)
        if count:
            region = region.replace(needle, replacement)
            patched += count

    if patched:
        data[start:start + strsz] = region
        with open(path, 'wb') as f:
            f.write(bytes(data))
    return patched


def main():
    source = sys.argv[1]
    target = sys.argv[2]

    # Not rmtree: the adb runtime stages its own libraries in the same directory,
    # and wiping it would silently drop them from the next build.
    os.makedirs(target, exist_ok=True)

    node_src = os.path.join(source, 'node')
    node_dst = os.path.join(target, 'libnodebin.so')
    shutil.copy2(node_src, node_dst)
    print(f'node -> libnodebin.so ({os.path.getsize(node_dst)/1024/1024:.1f} MB)')

    total = 0
    for src_name, dst_name in FILE_RENAMES.items():
        src = os.path.join(source, 'lib', src_name)
        if not os.path.exists(src):
            print(f'missing {src_name}')
            continue
        dst = os.path.join(target, dst_name)
        shutil.copy2(src, dst)
        total += os.path.getsize(dst)
        print(f'{src_name:24s} -> {dst_name:20s} {os.path.getsize(dst)/1024/1024:6.2f} MB')

    for src_name in ('libcares.so', 'libc++_shared.so'):
        src = os.path.join(source, 'lib', src_name)
        dst = os.path.join(target, src_name)
        shutil.copy2(src, dst)
        total += os.path.getsize(dst)
        print(f'{src_name:24s} -> {src_name:20s} {os.path.getsize(dst)/1024/1024:6.2f} MB')

    print('--- patching DT_NEEDED ---')
    for name in sorted(os.listdir(target)):
        count = patch(os.path.join(target, name))
        print(f'  {name:20s} {count} entries rewritten')


if __name__ == '__main__':
    main()
