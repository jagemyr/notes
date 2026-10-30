#!/usr/bin/env python3
"""
Ritar appikonen: sigillet med 茶 som i appen (cinnoberrött, gräddvitt tecken, tunn inre ram).

Tecknet tas från te/fonts/cha.woff2 (Ma Shan Zheng, OFL, bara 茶). Kräver Pillow, fontTools
och brotli. Resultatet ligger redan i res/, så skriptet behövs bara om ikonen ska ändras:

    python3 apk/make_icons.py
"""
import io
import os

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, '..', 'te', 'fonts', 'cha.woff2')
RES = os.path.join(HERE, 'res')

RED = (0xb3, 0x32, 0x2b, 255)
INK = (0xfb, 0xf3, 0xe6, 255)
CHA = '茶'
SS = 4  # ritas större och skalas ned för mjuka kanter

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def load_font():
    font = TTFont(FONT)
    font.flavor = None
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


FONT_DATA = load_font()


def draw_glyph(draw, box_size, center, height):
    """Ritar 茶 så att tecknets synliga höjd blir height, centrerat på center."""
    font = ImageFont.truetype(io.BytesIO(FONT_DATA), int(height))
    l, t, r, b = draw.textbbox((0, 0), CHA, font=font)
    scale = height / (b - t)
    font = ImageFont.truetype(io.BytesIO(FONT_DATA), max(1, int(height * scale)))
    l, t, r, b = draw.textbbox((0, 0), CHA, font=font)
    x = center[0] - (l + r) / 2
    y = center[1] - (t + b) / 2
    draw.text((x, y), CHA, font=font, fill=INK)


def legacy(px):
    """Vanlig ikon (före Android 8): rundad ruta med ram och tecken."""
    n = px * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = n * 0.06
    size = n - 2 * pad
    d.rounded_rectangle([pad, pad, n - pad, n - pad], radius=size * 0.12, fill=RED)
    inset = pad + size * 0.06
    d.rounded_rectangle([inset, inset, n - inset, n - inset], radius=size * 0.08,
                        outline=(INK[0], INK[1], INK[2], 140), width=max(1, int(size * 0.025)))
    draw_glyph(d, n, (n / 2, n / 2), size * 0.66)
    return img.resize((px, px), Image.LANCZOS)


def foreground(px):
    """Förgrund till den adaptiva ikonen (108 dp): bara tecknet, inom den säkra cirkeln (66 dp)."""
    n = px * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_glyph(d, n, (n / 2, n / 2), n * 0.44)
    return img.resize((px, px), Image.LANCZOS)


for name, k in DENSITIES.items():
    folder = os.path.join(RES, 'mipmap-' + name)
    os.makedirs(folder, exist_ok=True)
    legacy(round(48 * k)).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
    foreground(round(108 * k)).save(os.path.join(folder, 'ic_launcher_fg.png'), optimize=True)
    print('mipmap-' + name)
