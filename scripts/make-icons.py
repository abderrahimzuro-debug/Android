#!/usr/bin/env python3
"""Generate MathFlow's PWA icons without external image dependencies.

Pure-Python PNG writer with 3x supersampling. Run: python3 scripts/make-icons.py
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
SAMPLES = 3

MIDNIGHT = (11, 31, 49)
TEAL_A = (53, 201, 189)
TEAL_B = (11, 143, 138)
CREAM = (243, 198, 122)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect(x, y, radius):
    """Signed distance-ish test for a rounded square."""
    cx = min(max(x, radius), 1 - radius)
    cy = min(max(y, radius), 1 - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def curve_y(x):
    return 0.60 - 0.205 * math.sin(2 * math.pi * (x - 0.04)) + 0.045 * math.sin(4 * math.pi * (x - 0.04))


def pixel(x, y, maskable):
    # Maskable icons keep the artwork inside the central 80% safe zone.
    if maskable:
        x = 0.5 + (x - 0.5) / 0.76
        y = 0.5 + (y - 0.5) / 0.76

    outside = not rounded_rect(x, y, 0.22)
    if maskable:
        outside = False  # full-bleed background for adaptive icons
    if outside:
        return None

    color = MIDNIGHT
    alpha = 255

    # Warm horizon line.
    if 0.19 <= x <= 0.81 and abs(y - 0.795) <= 0.012:
        color = CREAM

    # Flowing teal curve.
    if 0.09 <= x <= 0.91:
        dy = abs(y - curve_y(x))
        if dy <= 0.035:
            t = (x - 0.09) / 0.82
            color = mix(TEAL_A, TEAL_B, t)
            edge = (dy - 0.026) / 0.009
            if edge > 0:
                alpha = max(0, min(255, round(255 * (1 - edge))))

    # Highlight dot.
    if (x - 0.745) ** 2 + (y - 0.305) ** 2 <= 0.052 ** 2:
        color = CREAM
        alpha = 255

    return (*color, alpha)


def render(size, maskable=False):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    x = (px + (sx + 0.5) / SAMPLES) / size
                    y = (py + (sy + 0.5) / SAMPLES) / size
                    c = pixel(x, y, maskable)
                    if c is None:
                        continue
                    r += c[0] * c[3]
                    g += c[1] * c[3]
                    b += c[2] * c[3]
                    a += c[3]
            count = SAMPLES * SAMPLES * 255
            if a == 0:
                row += b"\x00\x00\x00\x00"
            else:
                row += bytes((round(r / a), round(g / a), round(b / a), round(255 * a / count)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + row for row in rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, size, "x", size)


SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#35c9bd"/><stop offset="1" stop-color="#0b8f8a"/>
  </linearGradient></defs>
  <rect width="48" height="48" rx="11" fill="#0b1f31"/>
  <path d="M4 29c5 0 6-12 11-12s6 12 11 12 6-12 12-12" fill="none" stroke="url(#g)" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M9 38h30" stroke="#f3c67a" stroke-width="2" stroke-linecap="round"/>
  <circle cx="35.5" cy="17" r="3.4" fill="#f3c67a"/>
</svg>
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (192, 512):
        write_png(os.path.join(OUT, f"icon-{size}.png"), render(size))
    write_png(os.path.join(OUT, "maskable-512.png"), render(512, maskable=True))
    with open(os.path.join(ROOT, "public", "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(SVG)
    print("wrote public/favicon.svg")


if __name__ == "__main__":
    main()
