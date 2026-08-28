"""案例批量生成:读 cases.json,循环产出成品(周六 15:00-17:00 时段用)。

用法:
    python backend/batch.py                     # 用 backend/cases.json
    python backend/batch.py --cases my.json     # 指定配置
    python backend/batch.py --list              # 只列出待生成条目

cases.json 每个条目的字段(未写的字段取默认值):
    name    输出文件名前缀(必填)
    image   输入图片路径(必填,相对 WordArt 仓库根)
    mode    text / ascii / cloud(默认 text)
    text    短语(text/ascii 模式)
    words   cloud 模式词条列表
    其余同 generate.py 参数面板:cols/threshold/color_mode/fg/bg/
    font_size/spacing/invert/bold_edges/contrast/brightness/map_mode/mask
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate import main as generate_one  # noqa: E402

_PANEL_KEYS = {
    "cols", "threshold", "color_mode", "fg", "bg", "font_size",
    "spacing", "invert", "bold_edges", "contrast", "brightness",
    "map_mode", "mask", "scale", "font",
}


def load_cases(path: Path) -> list[dict]:
    cases = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        raise ValueError("cases.json 应为非空数组")
    for i, case in enumerate(cases):
        if not case.get("name") or not case.get("image"):
            raise ValueError(f"第 {i + 1} 条缺少 name 或 image 字段")
    return cases


def case_to_argv(case: dict, out_dir: str) -> list[str]:
    argv = ["--image", str(REPO_ROOT / case["image"]), "--out-dir", out_dir,
            "--name", case["name"]]
    if case.get("mode"):
        argv += ["--mode", case["mode"]]
    if case.get("text"):
        argv += ["--text", case["text"]]
    if case.get("words"):
        argv += ["--words", ",".join(case["words"])]
    if case.get("cloud_width"):
        argv += ["--cloud-width", str(case["cloud_width"])]
    if case.get("cloud_height"):
        argv += ["--cloud-height", str(case["cloud_height"])]
    if case.get("no_pdf"):
        argv += ["--no-pdf"]
    for key in _PANEL_KEYS:
        if key in case:
            value = case[key]
            if isinstance(value, bool):
                if value:
                    argv.append(f"--{key.replace('_', '-')}")
            else:
                argv += [f"--{key.replace('_', '-')}", str(value)]
    return argv


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="WordArt 案例批量生成")
    parser.add_argument("--cases", default=str(Path(__file__).parent / "cases.json"))
    parser.add_argument("--out-dir", default=str(Path(__file__).parent / "output"))
    parser.add_argument("--list", action="store_true", help="仅列出条目,不生成")
    args = parser.parse_args(argv)

    cases_path = Path(args.cases)
    if not cases_path.exists():
        print(f"[错误] 配置不存在: {cases_path}", file=sys.stderr)
        return 1
    cases = load_cases(cases_path)

    if args.list:
        for c in cases:
            print(f"  {c['name']:24s} {c.get('mode', 'text'):6s} <- {c['image']}")
        return 0

    ok = fail = 0
    for case in cases:
        print(f"==> 生成 {case['name']}({case.get('mode', 'text')})")
        try:
            code = generate_one(case_to_argv(case, args.out_dir))
        except Exception as exc:  # 单条失败不中断整批(周六赶时间)
            code = 1
            print(f"[失败] {case['name']}: {exc}", file=sys.stderr)
        ok += code == 0
        fail += code != 0
    print(f"\n完成:成功 {ok} / 失败 {fail},输出目录 {args.out_dir}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
