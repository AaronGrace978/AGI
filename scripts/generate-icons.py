#!/usr/bin/env python3
"""Rebuild Windows ICO, macOS ICNS, and Linux PNG sizes from build/icon.png."""

from __future__ import annotations

from pathlib import Path

from icnsutil import IcnsFile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
ICONS = BUILD / "icons"
SRC = BUILD / "icon.png"


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    if src.size != (1024, 1024):
        src = src.resize((1024, 1024), Image.Resampling.LANCZOS)

    ICONS.mkdir(parents=True, exist_ok=True)
    src.save(BUILD / "icon.png", "PNG", optimize=True)
    src.save(ROOT / "src" / "assets" / "app-icon.png", "PNG", optimize=True)

    for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        src.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f"{size}x{size}.png", "PNG", optimize=True)

    public = ROOT / "public"
    public.mkdir(exist_ok=True)
    src.resize((64, 64), Image.Resampling.LANCZOS).save(public / "favicon.png", "PNG", optimize=True)
    src.resize((256, 256), Image.Resampling.LANCZOS).save(public / "icon-256.png", "PNG", optimize=True)
    src.resize((512, 512), Image.Resampling.LANCZOS).save(ROOT / "electron" / "icon.png", "PNG", optimize=True)

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    src.save(BUILD / "icon.ico", format="ICO", sizes=ico_sizes)
    src.save(ROOT / "src" / "assets" / "app-icon.ico", format="ICO", sizes=ico_sizes)

    icns_tmp = Path("/tmp/agi-prime-icns")
    icns_tmp.mkdir(exist_ok=True)
    mapping = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    icns = IcnsFile()
    for name, size in mapping.items():
        path = icns_tmp / name
        src.resize((size, size), Image.Resampling.LANCZOS).save(path, "PNG")
        icns.add_media(file=str(path))
    icns.write(str(BUILD / "icon.icns"))
    print(f"Wrote icons from {SRC}")


if __name__ == "__main__":
    main()
