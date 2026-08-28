"""亮度采样与边缘检测:把图片变成"格子"矩阵。

三种引擎(文字画 / 纯文本字符画 / 词云)共用这里的采样逻辑,
保证同一张图在三条管线下的明暗判断一致。
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageOps


def load_image(path: str, max_side: int = 2400) -> Image.Image:
    """打开图片:转正(EXIF)、转 RGB、限制最大边(提速)。"""
    img = Image.open(path)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass  # 无 EXIF 或 EXIF 损坏时按原图处理
    img = img.convert("RGB")
    w, h = img.size
    longest = max(w, h)
    if longest > max_side:
        scale = max_side / longest
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    return img


def _enhance(img: Image.Image, contrast: float, brightness: float) -> Image.Image:
    """对比度 / 亮度预处理(参数面板 F4)。1.0 = 原图。"""
    if contrast != 1.0:
        from PIL import ImageEnhance
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if brightness != 1.0:
        from PIL import ImageEnhance
        img = ImageEnhance.Brightness(img).enhance(brightness)
    return img


def luminance_grid(
    img: Image.Image,
    cols: int,
    rows: int,
    *,
    contrast: float = 1.0,
    brightness: float = 1.0,
) -> np.ndarray:
    """采样为 rows x cols 的亮度矩阵(uint8,0=最暗,255=最亮)。"""
    img = _enhance(img, contrast, brightness)
    small = img.resize((cols, rows), Image.LANCZOS)
    arr = np.asarray(small, dtype=np.float32)
    # ITU-R BT.601 亮度加权,与浏览器端 Canvas 采样保持同口径
    lum = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
    return np.clip(lum, 0, 255).astype(np.uint8)


def rgb_grid(img: Image.Image, cols: int, rows: int) -> np.ndarray:
    """采样为 rows x cols x 3 的颜色矩阵(原色渲染模式用)。"""
    small = img.resize((cols, rows), Image.LANCZOS)
    return np.asarray(small, dtype=np.uint8)


def edge_grid(lum: np.ndarray, sensitivity: int = 36) -> np.ndarray:
    """一阶差分边缘检测,True = 该格子处在明暗交界("加粗边缘"参数用)。

    sensitivity 越小,越多格子被判为边缘。
    """
    gx = np.abs(np.diff(lum, axis=1, prepend=lum[:, :1]))
    gy = np.abs(np.diff(lum, axis=0, prepend=lum[:1, :]))
    return (gx + gy) > sensitivity
