"""WordArt 离线渲染管线(无服务器,本地批量生成案例用)。

三条管线:
    engine   文字画(核心):亮度阈值 + 自定义短语平铺 -> PNG/PDF
    textart  纯文本:ascii-magic 梯度字符 translate 成短语 -> TXT/PNG/PDF
    cloud    姓名拼图:wordcloud 按词频摆位置 -> PNG
"""
from .cloud import render_word_cloud
from .engine import RenderParams, TextArtEngine, render_text_art
from .exporter import save_pdf, save_png, save_text_pdf
from .textart import render_ascii_png, render_ascii_text

__all__ = [
    "RenderParams",
    "TextArtEngine",
    "render_text_art",
    "render_ascii_text",
    "render_ascii_png",
    "render_word_cloud",
    "save_png",
    "save_pdf",
    "save_text_pdf",
]
