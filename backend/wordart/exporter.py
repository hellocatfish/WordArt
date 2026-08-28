"""导出模块:PNG(1x/2x)与可打印 PDF(单页 A4、页边距、等宽字体)。

PDF 口径(spec F5):单页 A4、合理页边距、等宽字体,打印即成品。
Pillow 原生支持 save(pdf, resolution=dpi),无需引入 reportlab。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .fonts import find_mono_font

# A4 @ 300 DPI(210mm x 297mm)
A4_SHORT, A4_LONG = 2480, 3508
_MM_TO_INCH = 1 / 25.4


def save_png(img: Image.Image, path: str) -> str:
    path = _ensure_parent(path)
    img.convert("RGB").save(path, "PNG", optimize=True)
    return path


def save_pdf(img: Image.Image, path: str, dpi: int = 300, margin_mm: float = 12.0,
             background: str = "#ffffff") -> str:
    """任意成品图 -> 单页 A4 PDF,等比缩放、居中、留边距。"""
    path = _ensure_parent(path)
    canvas = Image.new("RGB", (A4_SHORT, A4_LONG), background)
    margin = round(margin_mm * _MM_TO_INCH * dpi)
    box_w, box_h = A4_SHORT - margin * 2, A4_LONG - margin * 2

    scaled = _fit_into(img, box_w, box_h)
    x = (A4_SHORT - scaled.width) // 2
    y = (A4_LONG - scaled.height) // 2
    canvas.paste(scaled, (x, y))
    canvas.save(path, "PDF", resolution=dpi)
    return path


def save_text_pdf(
    text: str,
    path: str,
    *,
    dpi: int = 300,
    margin_mm: float = 15.0,
    font_size: float = 9.0,
    background: str = "#ffffff",
    foreground: str = "#1a1a1a",
    font_path: str | None = None,
) -> str:
    """纯文本字符画 -> 单页 A4 PDF(等宽字体按行排版,供誊抄/打印)。

    字号单位为 pt,内部换算为 300dpi 像素;行数超出 A4 时自动缩小字号。
    """
    path = _ensure_parent(path)
    lines = text.splitlines()
    font_path = font_path or find_mono_font()
    size_px = max(4, round(font_size * dpi / 72))
    while size_px >= 4:
        font = ImageFont.truetype(font_path, size_px)
        cell_w = font.getlength("M")
        line_h = round(size_px * 1.25)
        margin = round(margin_mm * _MM_TO_INCH * dpi)
        box_w, box_h = A4_SHORT - margin * 2, A4_LONG - margin * 2
        cols = int(box_w // max(cell_w, 1))
        rows = int(box_h // line_h) if line_h else 0
        if lines and cols > 0 and len(lines) <= rows and all(
            len(l) <= cols for l in lines
        ):
            break
        size_px -= 1
    else:  # 缩到下限仍放不下:截断并提示(极端长文本才触发)
        lines = [l[:cols] for l in lines[:rows]]

    canvas = Image.new("RGB", (A4_SHORT, A4_LONG), background)
    draw = ImageDraw.Draw(canvas)
    for y, line in enumerate(lines):
        draw.text(
            (margin, margin + y * line_h + line_h / 2),
            line,
            font=font,
            fill=foreground,
            anchor="lm",
        )
    canvas.save(path, "PDF", resolution=dpi)
    return path


def _fit_into(img: Image.Image, box_w: int, box_h: int) -> Image.Image:
    scale = min(box_w / img.width, box_h / img.height, 1.0)
    if scale >= 1.0:  # 放大重采样,避免小图直接贴 A4 出锯齿
        scale = min(box_w / img.width, box_h / img.height)
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    return img.resize(size, Image.LANCZOS)


def _ensure_parent(path: str) -> str:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path
