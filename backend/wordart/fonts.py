"""字体查找:按平台定位可用的 CJK 字体与等宽字体。

中文渲染红线(HANDOVER.md):wordcloud 必须传 font_path,否则全是方框。
"""
from __future__ import annotations

import os
import sys

# CJK 字体候选,按优先级排列(前者优先)
_CJK_CANDIDATES: dict[str, list[str]] = {
    "win32": [
        r"C:\Windows\Fonts\msyh.ttc",      # 微软雅黑
        r"C:\Windows\Fonts\msyhbd.ttc",    # 微软雅黑 Bold
        r"C:\Windows\Fonts\simhei.ttf",    # 黑体
        r"C:\Windows\Fonts\simsun.ttc",    # 宋体
        r"C:\Windows\Fonts\Deng.ttf",      # 等线
    ],
    "darwin": [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ],
    "linux": [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ],
}

# 等宽字体候选(纯文本字符画渲染 PNG/PDF 用)
_MONO_CANDIDATES: dict[str, list[str]] = {
    "win32": [
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\lucon.ttf",
    ],
    "darwin": [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.ttf",
    ],
    "linux": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ],
}


def _first_existing(candidates: list[str]) -> str | None:
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def find_cjk_font() -> str:
    """返回第一个存在的 CJK 字体路径;找不到时抛错并给出指引。"""
    path = _first_existing(_CJK_CANDIDATES.get(sys.platform, []))
    if path is None:  # 兜底:跨平台候选再扫一遍
        path = _first_existing(
            [p for paths in _CJK_CANDIDATES.values() for p in paths]
        )
    if path is None:
        raise FileNotFoundError(
            "未找到系统 CJK 字体,请通过 font_path 参数显式指定,"
            "否则中文会渲染成方框(见 HANDOVER.md 风险红线)。"
        )
    return path


def find_mono_font() -> str:
    """返回第一个存在的等宽字体路径(找不到时退回 CJK 字体)。"""
    path = _first_existing(_MONO_CANDIDATES.get(sys.platform, []))
    return path or find_cjk_font()
