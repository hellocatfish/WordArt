"""核心渲染引擎:亮度矩阵 + 阈值渲染 + 自定义文字平铺。

参数面板语义与竞品 charart.odin-lab.com 对齐(HANDOVER.md 决策 5):
    渲染模式(原色/单色)、背景颜色、输出宽度、字号大小、字间距、
    亮度阈值、反转前景/背景、加粗边缘。
渲染路线走"阈值"(决策 5:实现比字号调制简单,推荐照此建模):
亮度低于阈值的格子铺短语字符,高于阈值的留背景色。

用法:
    engine = TextArtEngine()
    img = engine.render(Image.open("photo.jpg"), RenderParams(text="某某我爱你"))
    img.save("out.png")
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .fonts import find_cjk_font
from .sampling import edge_grid, luminance_grid, rgb_grid

# 中文字符接近正方形,行高给 8% 余量避免上下行贴死
_ROW_HEIGHT_FACTOR = 1.08


@dataclass
class RenderParams:
    """一次渲染的全部可调参数(与前端参数面板一一对应)。"""

    text: str = "我爱你"          # 自定义短语,平铺整幅图
    cols: int = 100                # 输出宽度(列数,决定分辨率)
    mode: str = "mono"             # 渲染模式:mono=单色 / color=原色
    fg_color: str = "#1a1a1a"     # 单色模式前景色
    bg_color: str = "#ffffff"      # 背景颜色
    font_size: int = 18           # 字号大小(px)
    letter_spacing: float = 0.0   # 字间距(px,加在格子宽度上)
    threshold: int = 128          # 亮度阈值:低于阈值画字(0-255)
    invert: bool = False           # 反转前景/背景(黑字白底 <-> 白字黑底)
    bold_edges: bool = False       # 加粗边缘:明暗交界处强制画字并加粗
    contrast: float = 1.0         # 图像预处理:对比度
    brightness: float = 1.0        # 图像预处理:亮度
    font_path: str | None = None  # 不传则自动定位系统 CJK 字体
    edge_sensitivity: int = 36    # 边缘判定灵敏度(数值越小边缘越多)

    def __post_init__(self) -> None:
        if not self.text or not self.text.strip():
            raise ValueError("自定义短语不能为空")
        self.text = self.text.strip()
        if not 8 <= int(self.cols) <= 400:
            raise ValueError("输出宽度(列数)需在 8-400 之间")
        if not 1 <= int(self.threshold) <= 255:
            raise ValueError("亮度阈值需在 1-255 之间")


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = color.strip()
    if color.startswith("#"):
        color = color[1:]
    if len(color) == 3:
        color = "".join(c * 2 for c in color)
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _luminance_of(rgb: tuple[int, int, int]) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


class TextArtEngine:
    """把图片渲染成"由短语拼成的画"。"""

    def render(
        self,
        image: Image.Image,
        params: RenderParams,
        scale: int = 1,
    ) -> Image.Image:
        """渲染入口。scale>1 时按倍数放大字号输出高清版(矢量重渲染,不发糊)。"""
        font_size = params.font_size * scale
        cell_w = round((font_size + params.letter_spacing * scale) * 1.0)
        cell_h = round(font_size * _ROW_HEIGHT_FACTOR)

        img_w, img_h = image.size
        rows = max(1, round(params.cols * img_h / img_w * cell_w / cell_h))

        lum = luminance_grid(
            image,
            params.cols,
            rows,
            contrast=params.contrast,
            brightness=params.brightness,
        )

        # 阈值掩码:暗处画字;反转则亮处画字
        mask = lum < params.threshold
        if params.invert:
            mask = ~mask

        # 加粗边缘:明暗交界处强制画字(3 米外可辨认原图的关键)
        edges = edge_grid(lum, params.edge_sensitivity) if params.bold_edges else None
        if edges is not None:
            mask = mask | edges

        colors = None
        if params.mode == "color":
            colors = rgb_grid(image, params.cols, rows)

        bg_rgb = _hex_to_rgb(params.bg_color)
        fg_rgb = _hex_to_rgb(params.fg_color)
        bg_is_light = _luminance_of(bg_rgb) >= 128
        stroke_w = max(1, font_size // 14)

        font_path = params.font_path or find_cjk_font()
        font = ImageFont.truetype(font_path, font_size)

        canvas = Image.new("RGB", (params.cols * cell_w, rows * cell_h), bg_rgb)
        draw = ImageDraw.Draw(canvas)

        chars = list(params.text)
        n_chars = len(chars)
        counter = 0
        for r in range(rows):
            for c in range(params.cols):
                if not mask[r, c]:
                    continue
                ch = chars[counter % n_chars]
                counter += 1
                if ch == " ":
                    continue  # 短语中的空格保留为呼吸位
                if colors is not None:
                    fill = _readable_color(colors[r, c], bg_is_light)
                else:
                    fill = fg_rgb
                is_edge = edges is not None and bool(edges[r, c])
                draw.text(
                    (c * cell_w + cell_w / 2, r * cell_h + cell_h / 2),
                    ch,
                    font=font,
                    fill=fill,
                    anchor="mm",
                    stroke_width=stroke_w if is_edge else 0,
                    stroke_fill=fill,
                )
        return canvas


def _readable_color(
    rgb: np.ndarray, bg_is_light: bool
) -> tuple[int, int, int]:
    """原色模式的可读性保护:字符颜色不能和背景混在一起。"""
    r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
    if bg_is_light:
        return min(r, 200), min(g, 200), min(b, 200)
    return max(r, 55), max(g, 55), max(b, 55)


def render_text_art(
    image_path: str,
    params: RenderParams | None = None,
    scale: int = 1,
) -> Image.Image:
    """便捷入口:路径进、成品图出。"""
    from .sampling import load_image

    return TextArtEngine().render(load_image(image_path), params or RenderParams(), scale)
