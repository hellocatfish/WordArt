"""WordArt 单图生成 CLI。

示例:
    # 文字画(PNG 1x + 2x + PDF 一次出齐)
    python backend/generate.py --image photo.jpg --text "某某我爱你"

    # 白字黑底、加粗边缘、原色渲染
    python backend/generate.py --image logo.png --text "WordArt" \
        --bg "#0b0b12" --fg "#f5f5f5" --color-mode color --bold-edges --invert

    # 纯文本版(ascii-magic 梯度映射成短语,出 TXT + PNG + PDF)
    python backend/generate.py --image photo.jpg --text "某某我爱你" --mode ascii

    # 姓名拼图(wordcloud)
    python backend/generate.py --mode cloud --words "张三,李四,王五,赵六" \
        --image mascot.png --mask mascot.png

参数面板语义与竞品对齐,详细说明见 backend/README.md。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 允许 `python backend/generate.py` 直接运行
sys.path.insert(0, str(Path(__file__).resolve().parent))

from wordart import (  # noqa: E402
    RenderParams,
    render_ascii_png,
    render_ascii_text,
    render_text_art,
    render_word_cloud,
    save_pdf,
    save_png,
    save_text_pdf,
)
from wordart.sampling import load_image  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="WordArt 离线渲染管线")
    p.add_argument("--image", required=True, help="输入图片路径")
    p.add_argument("--text", default="我爱你", help="自定义短语(文字画/纯文本模式)")
    p.add_argument(
        "--mode", default="text", choices=["text", "ascii", "cloud"],
        help="管线:text=文字画(默认),ascii=纯文本,cloud=姓名词云",
    )
    p.add_argument("--words", default="", help="cloud 模式词条,逗号分隔,可写 名字:权重")
    p.add_argument("--mask", default="", help="cloud 模式可选形状蒙版图路径")

    # ---- 参数面板(照抄竞品语义) ----
    g = p.add_argument_group("参数面板")
    g.add_argument("--cols", type=int, default=110, help="输出宽度(列数)")
    g.add_argument("--threshold", type=int, default=128, help="亮度阈值(1-255)")
    g.add_argument("--color-mode", default="mono", choices=["mono", "color"], help="渲染模式:单色/原色")
    g.add_argument("--fg", default="#1a1a1a", help="前景色(单色模式)")
    g.add_argument("--bg", default="#ffffff", help="背景颜色")
    g.add_argument("--font-size", type=int, default=18, help="字号大小(px)")
    g.add_argument("--spacing", type=float, default=0.0, help="字间距(px)")
    g.add_argument("--invert", action="store_true", help="反转前景/背景")
    g.add_argument("--bold-edges", action="store_true", help="加粗边缘(明暗交界处)")
    g.add_argument("--contrast", type=float, default=1.0, help="预处理:对比度")
    g.add_argument("--brightness", type=float, default=1.0, help="预处理:亮度")

    # ---- 输出 ----
    o = p.add_argument_group("输出")
    o.add_argument("--out-dir", default=str(Path(__file__).parent / "output"), help="输出目录")
    o.add_argument("--name", default="", help="输出文件名前缀(默认用图片文件名)")
    o.add_argument("--scale", type=int, default=2, help="高清 PNG 倍数(默认 2x)")
    o.add_argument("--no-pdf", action="store_true", help="不导出 PDF")
    o.add_argument("--map-mode", default="band", choices=["band", "char"],
                   help="ascii 模式梯度->短语映射方式:band=按密度分段(推荐)/char=逐字符")
    o.add_argument("--cloud-width", type=int, default=2000, help="cloud 模式输出宽(px)")
    o.add_argument("--cloud-height", type=int, default=1400, help="cloud 模式输出高(px)")
    o.add_argument("--font", default="", help="字体路径(默认自动定位系统 CJK 字体)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not Path(args.image).exists():
        print(f"[错误] 图片不存在: {args.image}", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = args.name or Path(args.image).stem
    outputs: list[str] = []

    if args.mode == "text":
        params = RenderParams(
            text=args.text,
            cols=args.cols,
            mode=args.color_mode,
            fg_color=args.fg,
            bg_color=args.bg,
            font_size=args.font_size,
            letter_spacing=args.spacing,
            threshold=args.threshold,
            invert=args.invert,
            bold_edges=args.bold_edges,
            contrast=args.contrast,
            brightness=args.brightness,
            font_path=args.font or None,
        )
        img = render_text_art(args.image, params)
        outputs.append(save_png(img, str(out_dir / f"{stem}.png")))
        if args.scale > 1:
            hi = render_text_art(args.image, params, scale=args.scale)
            outputs.append(save_png(hi, str(out_dir / f"{stem}@{args.scale}x.png")))
        if not args.no_pdf:
            outputs.append(save_pdf(img, str(out_dir / f"{stem}.pdf")))

    elif args.mode == "ascii":
        text = render_ascii_text(
            args.image,
            args.text,
            cols=args.cols,
            map_mode=args.map_mode,
            contrast=args.contrast,
            brightness=args.brightness,
            invert=args.invert,
        )
        txt_path = out_dir / f"{stem}.txt"
        txt_path.write_text(text, encoding="utf-8")
        outputs.append(str(txt_path))
        img = render_ascii_png(text, font_size=16, fg=args.fg, bg=args.bg,
                                font_path=args.font or None)
        outputs.append(save_png(img, str(out_dir / f"{stem}.png")))
        if not args.no_pdf:
            outputs.append(save_text_pdf(text, str(out_dir / f"{stem}.pdf")))

    else:  # cloud
        words = [w.strip() for w in args.words.split(",") if w.strip()]
        if not words:
            print("[错误] cloud 模式需要 --words(逗号分隔词条)", file=sys.stderr)
            return 1
        img = render_word_cloud(
            words,
            mask_image=args.mask or None,
            width=args.cloud_width,
            height=args.cloud_height,
            background_color=args.bg,
            font_path=args.font or None,
        )
        outputs.append(save_png(img, str(out_dir / f"{stem}.png")))
        if not args.no_pdf:
            outputs.append(save_pdf(img, str(out_dir / f"{stem}.pdf")))

    print("已生成:")
    for path in outputs:
        print(f"  {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
