"""纯文本字符画管线(ascii-magic 路线)。

思路(HANDOVER.md 决策 2):
    1. 用 ascii-magic 把图片转成"固定梯度字符"网格(密度表现明暗);
    2. 用 str.translate() 把梯度字符逐个映射成用户短语,空格保留;
    3. 输出 .txt(可复制、可手写誊抄),也可渲染成 PNG。
若 ascii-magic 不可用,自动退回内置梯度采样(结果同构)。
"""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from .fonts import find_cjk_font, find_mono_font
from .sampling import load_image, luminance_grid

try:  # ascii-magic 是默认路线,缺库时自动降级
    import ascii_magic
    from ascii_magic.constants import CHARS_BY_DENSITY

    HAS_ASCII_MAGIC = True
except ImportError:  # pragma: no cover
    ascii_magic = None  # type: ignore[assignment]
    CHARS_BY_DENSITY = ""  # type: ignore[assignment]
    HAS_ASCII_MAGIC = False

# 自研梯度(从疏到密),与 ascii-magic 同口径,作为降级方案
_FALLBACK_GRADIENT = " .:-=+*#%@"
# 终端等宽字符的宽高比(宽/高),行数按此修正
_WIDTH_RATIO = 2.2


def render_ascii_grid(
    image_path: str,
    cols: int = 100,
    *,
    contrast: float = 1.0,
    brightness: float = 1.0,
    invert: bool = False,
) -> list[str]:
    """图片 -> 梯度字符网格(每元素一行字符串)。"""
    img = load_image(image_path)
    if HAS_ASCII_MAGIC:
        from PIL import ImageEnhance, ImageOps

        if contrast != 1.0:
            img = ImageEnhance.Contrast(img).enhance(contrast)
        if brightness != 1.0:
            img = ImageEnhance.Brightness(img).enhance(brightness)
        if invert:
            img = ImageOps.invert(img)
        art = ascii_magic.from_pillow_image(img)  # type: ignore[union-attr]
        text = art.to_ascii(columns=cols)
        return [line for line in text.splitlines() if line]
    return _builtin_grid(img, cols, contrast=contrast, invert=invert)


def _builtin_grid(
    img: Image.Image,
    cols: int,
    *,
    contrast: float = 1.0,
    invert: bool = False,
) -> list[str]:
    """降级路径:自研梯度采样,行数按终端字符宽高比修正。"""
    rows = max(1, round(cols * img.height / img.width / _WIDTH_RATIO))
    lum = luminance_grid(img, cols, rows, contrast=contrast)
    if invert:
        lum = 255 - lum
    gradient = _FALLBACK_GRADIENT
    n = len(gradient) - 1
    idx = ((255 - lum.astype("int32")) * n + 127) // 255  # 暗处取密字符
    return ["".join(gradient[i] for i in row) for row in idx]


def build_phrase_mapping(
    phrase: str,
    *,
    mode: str = "band",
    gradient: str | None = None,
) -> dict[int, int]:
    """构造 translate 映射表:梯度字符 -> 短语字符,空格恒映射为空格。

    mode='band'(推荐):梯度按密度均分成 len(phrase) 段,第 i 段整体
        映射为短语第 i 字——暗区一种字、亮区另一种字,短语大面积连续。
    mode='char':HANDOVER 字面语义,梯度字符逐个循环映射到短语字符。
    """
    if not phrase or not phrase.strip():
        raise ValueError("自定义短语不能为空")
    phrase = phrase.strip()
    source = gradient if gradient else (CHARS_BY_DENSITY or _FALLBACK_GRADIENT)
    dense_chars = [c for c in source if c != " "]
    # CHARS_BY_DENSITY 从疏到密排列,统一翻转为"从密到疏"
    dense_chars = list(reversed(dense_chars))
    mapping: dict[int, int] = {ord(" "): ord(" ")}
    chars = list(phrase)
    if mode == "char":
        mapping.update({ord(g): ord(chars[i % len(chars)]) for i, g in enumerate(dense_chars)})
    else:
        n_seg = len(chars)
        for i, g in enumerate(dense_chars):
            mapping[ord(g)] = ord(chars[min(i * n_seg // len(dense_chars), n_seg - 1)])
    return mapping


def render_ascii_text(
    image_path: str,
    phrase: str,
    cols: int = 100,
    *,
    map_mode: str = "band",
    contrast: float = 1.0,
    brightness: float = 1.0,
    invert: bool = False,
) -> str:
    """一步到位:图片 + 短语 -> 纯文本字符画(整段字符串)。"""
    grid = render_ascii_grid(
        image_path, cols, contrast=contrast, brightness=brightness, invert=invert
    )
    table = build_phrase_mapping(phrase, mode=map_mode)
    return "\n".join(line.translate(table) for line in grid)


def render_ascii_png(
    text: str,
    *,
    font_size: int = 14,
    fg: str = "#1a1a1a",
    bg: str = "#ffffff",
    font_path: str | None = None,
) -> Image.Image:
    """把纯文本字符画渲染成 PNG(自动按内容选择 CJK / 等宽字体)。"""
    has_cjk = any(ord(ch) > 0x2E80 for ch in text)
    if font_path is None:
        font_path = find_cjk_font() if has_cjk else find_mono_font()
    font = ImageFont.truetype(font_path, font_size)
    lines = text.splitlines() or [" "]
    if has_cjk:  # CJK 方块字:格宽约等于字号
        cell_w = font_size * 1.02
        line_h = round(font_size * 1.18)
    else:        # 等宽字符:按 'M' 的实际宽度
        cell_w = font.getlength("M")
        line_h = round(font_size * 1.25)
    canvas = Image.new(
        "RGB",
        (round(cell_w * max(len(l) for l in lines)) + 8, line_h * len(lines) + 8),
        bg,
    )
    draw = ImageDraw.Draw(canvas)
    for y, line in enumerate(lines):
        draw.text((4, y * line_h + line_h / 2 + 4), line, font=font, fill=fg, anchor="lm")
    return canvas
