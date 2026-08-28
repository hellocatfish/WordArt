# WordArt Backend — 离线渲染管线

> 按 `HANDOVER.md` 决策 1:**无后端服务器**。本目录是 Python 离线脚本(非服务),
> 用于周六下午批量生成案例成品图;线上产品是纯前端,用户图片只在浏览器本地处理。

## 安装

```bash
pip install -r backend/requirements.txt
```

依赖:Pillow / numpy / wordcloud / ascii-magic。中文字体自动定位系统字体
(Windows:微软雅黑;Linux:Noto/文泉驿;macOS:PingFang),无需额外安装。

## 三条管线

| 管线 | mode | 用途 | 输出 |
|---|---|---|---|
| 文字画(核心) | `text` | 亮度阈值 + 自定义短语平铺整幅图 | PNG 1x/2x + PDF(A4) |
| 纯文本 | `ascii` | ascii-magic 梯度字符 `str.translate()` 映射成短语,空格保留 | TXT + PNG + PDF |
| 姓名拼图 | `cloud` | wordcloud 出词云,可套图片轮廓蒙版 | PNG + PDF |

`text` 与 `ascii` 的渲染算法与浏览器端 JS 引擎同口径(BT.601 亮度、阈值二值化),
方便两边效果对齐。

## 快速开始

```bash
# 文字画:合影 + "某某我爱你"
python backend/generate.py --image photo.jpg --text "某某我爱你"

# 深底白字、加粗边缘、原色渲染(logo/梗图风格)
python backend/generate.py --image logo.png --text "WordArt" \
    --bg "#0b0b12" --fg "#f5f5f5" --invert --bold-edges --color-mode color

# 纯文本版(输出 demo.txt 可复制誊抄)
python backend/generate.py --image photo.jpg --text "某某我爱你" --mode ascii

# 姓名拼图(全员姓名拼吉祥物:--mask 给出轮廓图)
python backend/generate.py --mode cloud --mask mascot.png \
    --words "张三,李四,王五,赵六:3" --image mascot.png
```

批量生成案例(周六 15:00–17:00 时段):

```bash
python backend/batch.py            # 按 backend/cases.json 逐条生成
python backend/batch.py --list    # 只列出条目
```

把真实案例图(合影/logo/梗图/吉祥物)路径和文字填进 `backend/cases.json`,
一条命令出全套成品,单条失败不中断整批。

## 参数面板(与竞品 charart.odin-lab.com 语义对齐)

| 参数 | CLI | 默认 | 说明 |
|---|---|---|---|
| 渲染模式 | `--color-mode` | `mono` | `mono` 单色 / `color` 原色(字色取自原图) |
| 背景颜色 | `--bg` | `#ffffff` | 画布背景 |
| 前景色 | `--fg` | `#1a1a1a` | 单色模式的字色 |
| 输出宽度 | `--cols` | `110` | 列数(分辨率) |
| 字号大小 | `--font-size` | `18` | 每格字符像素(px) |
| 字间距 | `--spacing` | `0` | 格宽附加像素 |
| 亮度阈值 | `--threshold` | `128` | 亮度低于阈值画字 |
| 反转前景/背景 | `--invert` | 关 | 暗底亮图必开(如夜景合影) |
| 加粗边缘 | `--bold-edges` | 关 | 明暗交界处强制画字并加粗,3 米外可辨认原图 |
| 对比度/亮度 | `--contrast` / `--brightness` | `1.0` | 预处理,救低对比图 |
| 高清倍数 | `--scale` | `2` | 同参矢量重渲染,不发糊 |

调参经验:背景暗的图开 `--invert`;想要轮廓清晰开 `--bold-edges`;
太灰的图先拉 `--contrast 1.3`。

## 输出与打印链路

- `name.png` — 成品 1x;`name@2x.png` — 高清版(矢量重渲染,非放大)
- `name.pdf` — 单页 A4、300 DPI、居中留边(12mm),打印即成品
- `name.txt` — ascii 模式的纯文本,可复制手写誊抄

## 目录结构

```
backend/
├── wordart/            # 渲染库
│   ├── engine.py       #   文字画核心(阈值渲染 + 短语平铺)
│   ├── textart.py      #   ascii-magic 梯度 → translate 短语
│   ├── cloud.py        #   wordcloud 姓名拼图(含轮廓蒙版)
│   ├── exporter.py     #   PNG/PDF(A4)导出
│   ├── sampling.py     #   亮度采样 + 边缘检测(三管线共用)
│   └── fonts.py        #   系统字体定位(CJK 红线:必须显式 font_path)
├── generate.py         # 单图 CLI
├── batch.py            # 案例批量生成
├── cases.json          # 案例配置(周六填入真实图)
├── make_demo_assets.py # 生成自测演示图
├── assets/demo/        # 自测图(球体/LOVE/心形)
└── output/             # 成品输出(已 gitignore,生成后上传腾讯云 COS)
```

## 自测

```bash
python backend/make_demo_assets.py   # 重新生成演示图
python backend/batch.py              # 五条 demo 全跑通
```
