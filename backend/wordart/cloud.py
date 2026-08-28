"""姓名拼图引擎(wordcloud 路线)。

场景:Image=公司吉祥物,Word=全员姓名,输出由所有人姓名拼成的
吉祥物大图(PPT 主打 / 周年庆纪念物)。
中文红线:必须显式传 font_path,否则渲染全是方框(HANDOVER.md)。
"""
from __future__ import annotations

from collections import Counter
from typing import Iterable, Mapping

from PIL import Image

from .fonts import find_cjk_font
from .sampling import load_image

try:
    from wordcloud import WordCloud

    HAS_WORDCLOUD = True
except ImportError:  # pragma: no cover
    WordCloud = None  # type: ignore[assignment]
    HAS_WORDCLOUD = False


def normalize_words(words: Iterable[str] | Mapping[str, int]) -> dict[str, int]:
    """支持三种输入:list[str]、dict[str,int]、以及 "名字:权重" 写法的 list。"""
    if isinstance(words, Mapping):
        return {str(k).strip(): int(v) for k, v in words.items() if str(k).strip()}
    freq: Counter[str] = Counter()
    for item in words:
        name, _, weight = str(item).partition(":")
        name = name.strip()
        if not name:
            continue
        freq[name] += int(weight) if weight.strip().isdigit() else 1
    return dict(freq)


def render_word_cloud(
    words: Iterable[str] | Mapping[str, int],
    *,
    mask_image: str | None = None,
    width: int = 2000,
    height: int = 1400,
    background_color: str = "white",
    font_path: str | None = None,
    repeat: bool = True,
    colormap: str = "viridis",
    mono_color: tuple[int, int, int] | None = None,
    margin: int = 4,
    random_state: int = 42,
) -> Image.Image:
    """姓名列表 -> 词云成品图。

    mask_image:可选,提供后文字只在图片非白区域内排布(吉祥物形状)。
    mono_color:可选 (r,g,b),单色输出;不传则用 matplotlib colormap 上色。
    """
    if not HAS_WORDCLOUD:
        raise RuntimeError("缺少 wordcloud 库:pip install wordcloud")

    freq = normalize_words(words)
    if not freq:
        raise ValueError("姓名/词条列表为空")

    font_path = font_path or find_cjk_font()
    mask = None
    if mask_image:
        import numpy as np

        # wordcloud 的 mask 语义:RGB 全白的像素视为"已占用"(不排词),
        # 其余像素可排词 —— 因此直接传 RGB uint8 数组即可,白底自动被排除。
        mask = np.asarray(load_image(mask_image)).copy()
        mask[(mask > 250).all(axis=-1)] = 255  # 抹平浅噪点,避免边缘残留可排区

    color_func = None
    if mono_color is not None:
        color_func = lambda *a, **k: mono_color  # noqa: E731

    wc = WordCloud(
        font_path=font_path,
        width=width,
        height=height,
        background_color=background_color,
        repeat=repeat,
        collocations=False,
        colormap=colormap,
        color_func=color_func,
        margin=margin,
        prefer_horizontal=0.95,
        random_state=random_state,
        mask=mask,
    )
    wc.generate_from_frequencies(freq)
    return wc.to_image()
