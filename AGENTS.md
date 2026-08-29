# AGENTS.md — WordArt 仓库导航

WordArt 是黑客松项目(2026-08-29 开发,08-30 下午展示 5 分钟):用户上传图片 + 输入自定义短语(如"某某我爱你"),生成由该短语平铺而成的字符画,导出 PNG/PDF 打印做成可送人的礼物。仓库分两块:`backend/` 是 Python 离线渲染管线(批量生成案例用,不是服务),`frontend/` 是纯静态浏览器应用(线上产品本体)。

## 硬红线

改代码前先记住四条,违反任何一条都会破坏展示:

1. **无后端服务器、不上传用户图片**。所有图片处理在浏览器本地 Canvas 完成,网络面板零上传请求——这是现场演示要讲的隐私卖点。`backend/` 目录是离线脚本,永远不要改造成网络服务。
2. **CJK 字体必须显式指定**。Python 端 wordcloud / ImageFont 必须传 `font_path`,否则中文全是方框(见 `backend/wordart/fonts.py`);JS 端 Canvas 必须用 `engine.js` 里的 `CJK_FONT_STACK`。
3. **双端渲染口径锁死**。BT.601 亮度加权、边缘灵敏度 36、行高因子 1.08、阈值判定(低于阈值画字)在 Python 与 JS 两侧是同一组常量。改一侧必须同步另一侧,否则同一组参数无法双端复现同一效果。
4. **时间红线**:周六 15:00 硬停调参,之后只修不加;周日只做 PPT 定稿与排练,不写新功能(详见 `HANDOVER.md` 风险红线一节)。

## 仓库结构

```
WordArt/
├── AGENTS.md                # 本文件:仓库速览,给 AI 代理/新会话
├── HANDOVER.md              # 开发交接:背景、已锁定决策、验收标准、风险红线
├── spec.md                  # 功能规格:F1-F9 分级、非功能需求、验收口径
├── intent.md                # 立项动机:用户场景(恋爱合影、全员姓名拼吉祥物)
├── plan.md                  # 周六逐时段时间表、展示脚本、兜底方案
├── .gitignore               # 忽略 output/ dist/ node_modules/ .npm-cache/
│
├── backend/                 # Python 离线渲染管线(Python >= 3.10)
│   ├── wordart/             # 渲染库,六个模块
│   │   ├── __init__.py      #   公开 API 聚合
│   │   ├── engine.py        #   文字画核心:RenderParams + TextArtEngine
│   │   ├── sampling.py      #   共用采样:亮度/颜色矩阵、边缘检测、图片加载
│   │   ├── textart.py       #   纯文本管线:ascii-magic 梯度 translate 成短语
│   │   ├── cloud.py         #   姓名拼图:wordcloud,支持形状蒙版与权重
│   │   ├── exporter.py      #   导出:PNG / 单页 A4 PDF(Pillow 原生,300 DPI)
│   │   └── fonts.py         #   跨平台 CJK / 等宽字体定位
│   ├── generate.py          # 单图 CLI(text / ascii / cloud 三种模式)
│   ├── batch.py             # 批量生成:读 cases.json,单条失败不中断
│   ├── cases.json           # 案例配置(9 条)
│   ├── make_demo_assets.py  # 生成自测演示图(球体/LOVE/心形)
│   ├── requirements.txt     # pillow / numpy / wordcloud / ascii-magic
│   ├── assets/demo/         # 输入图:sphere/love/heart.png + 头像.jpg + miaosilogo.jpg + father.jpg + friend.jpg
│   └── output/              # 成品输出(gitignore,不入库)
│
└── frontend/                # 浏览器应用(Vite 5 + 原生 JS + Canvas,运行时零框架)
    ├── README.md            # 前端说明:命令、功能、渲染口径、加载性能
    ├── index.html           # 单页结构:工作区(预览 + 参数面板)+ 案例画廊;头部 4 个字体 preload
    ├── vite.config.js       # base './' 相对路径,任意静态目录可托管
    ├── package.json         # jspdf + vite(字体不依赖 npm 包,已预生成于 public/fonts/)
    ├── src/
    │   ├── engine.js        # 渲染引擎:与 Python 同口径(computeLayout/paint)
    │   ├── main.js          # 交互:上传/拖拽/粘贴、参数绑定、预设、导出、字体切换
    │   ├── cropper.js       # 裁剪对话框:归一化裁剪框 + 8 手柄拖拽(Pointer Events)
    │   ├── exporter.js      # 导出:PNG / A4 PDF(jsPDF 懒加载)/ TXT
    │   ├── demo.js          # 空状态演示:内置心形 + 当前参数实时刷
    │   ├── fonts.js         # 画字字体:三档(系统/竹石体/沐瑶),COS 主源 + 本地兜底
    │   ├── fonts.css        # @font-face:4 个子集化 woff2(指向 public/fonts/)
    │   └── style.css        # 样式:双主题(纸墨/夜航)+ 响应式(桌面通栏输入 banner / ≤960px 同屏双栏)
    └── public/
        ├── fonts/           # 子集化 woff2 4 个(思源宋体/霞鹜文楷 ~715KB)+ 手写 TTF 兜底 2 个(竹石体/沐瑶)
        ├── samples/         # 一键示例图 6 张 WebP(心形/头像/logo/爸爸背影/朋友/luffy)
        ├── cases/           # 画廊案例图 6 张 WebP(恋人/爸爸/朋友/公司/爱好/同事压轴)
        ├── _headers         # Cloudflare Pages 缓存:assets/fonts 一年 immutable,samples/cases 7 天
        └── favicon.svg
```

## 常用命令

### 后端(Python 离线管线)

统一在仓库根目录执行,路径按仓库根解析:

```bash
pip install -r backend/requirements.txt   # 首次安装

# 文字画核心管线:一次出齐 name.png + name@2x.png + name.pdf
python backend/generate.py --image backend/assets/demo/miaosilogo.jpg --text "秒思" --threshold 215

# 纯文本管线:TXT 可复制誊抄 + PNG + PDF
python backend/generate.py --image photo.jpg --text "某某我爱你" --mode ascii

# 姓名拼图:wordcloud,--words 支持 "名字:权重" 写法,--mask 给轮廓
python backend/generate.py --mode cloud --words "张三,李四:3,王五" \
    --image mascot.png --mask mascot.png

python backend/batch.py            # 按 cases.json 批量生成
python backend/batch.py --list     # 只列条目
python backend/make_demo_assets.py # 重新生成自测演示图
```

### 前端(浏览器应用)

```bash
cd frontend
npm install --cache .npm-cache   # Windows 权限报错时的写法,正常时省略 --cache
npm run dev                      # 开发: http://localhost:5173
npm run build                    # 产出 dist/ 纯静态站点
npm run preview                  # 预览 dist;固定端口用 npx vite preview --port 4173 --strictPort
```

`dist/` 因 `base './'` 相对路径,可直接托管到 Cloudflare Pages / 任意静态目录,断网双击 `index.html` 也能用。全部资源(示例图/案例图/字体)同源随包,不依赖腾讯云 COS 等外链。字体为自托管 webfont:思源宋体(标题衬线,400/700)+ 霞鹜文楷(标语/印章楷体,400/700),按站点字符集(页面文案 + ASCII + 常用姓氏/称谓/祝福语,思源宋体 400 额外收录常用输入字)子集化为 4 个 woff2 存于 `public/fonts/`(共 ~715KB),`index.html` 头部 preload、`src/fonts.css` 声明 @font-face,构建时被 base './' 重写为相对路径;手机弱网首屏字体从 ~2MB/几十个请求收敛到 4 个请求,未收录字符自动回退系统字体栈,访客设备无需预装字体。

「画字字体」即字画正文的 Canvas 渲染字体,与页面 UI 字体(思源宋体/霞鹜文楷)无关,成品预览右上角三档可切换:系统黑体(默认,零下载)/ 杨任东竹石体(硬笔手写)/ 沐瑶随心手写体(中性笔手写)。手写字体源策略:COS 加速域名为主源(`https://wordart202608-1379320306.cos.accelerate.myqcloud.com/`,桶已配 CORS:来源含 pages.dev / localhost / 127.0.0.1,Methods GET+HEAD,Max-Age 600),本地 `public/fonts/` 同款 TTF 兜底(`fonts.js` 的 `ensureFont` 依次尝试,任一成功即入册 `document.fonts`)——COS 未配 CORS / 弱网 / 离线时自动回退同源文件,演示永不因字体缺失白屏;仅在点开对应档位时按需加载(竹石体 ~4.3MB / 沐瑶 ~3.5MB,加载中按钮 loading 态、失败回退系统并 toast),首屏零额外下载;选择用 `localStorage` 持久化(刷新恢复,后台预热字体就绪后自动重渲);`engine.js` 的 `activeFontStack` 被切换后,预览与导出(1x/2x/PDF)自然使用同一画字字体,手写体未收录字符回退系统字体栈。

移动端加载提速口径(2026-08-29 定稿,针对手机 Safari 实测偏慢):字体子集化(上段);案例图/示例图全部转 WebP(cases 760px q72 共 ~558KB 画廊展示用、samples 1400px q85 共 ~190KB 渲染输入用,`loading="lazy"` 按需拉);jsPDF + html2canvas 拆为点击「导出 PDF」时才加载的懒 chunk(首屏 JS ~173KB/gzip ~60KB,PDF 组件 ~560KB 不占首屏);`public/_headers` 配 Cloudflare Pages 缓存(assets/fonts 一年 immutable,案例/示例图 7 天,回访近零请求)。注意事项:字体文件名固定、内容变更时需改文件名破缓存(如加 `-v2`);`_headers` 只在 Cloudflare Pages 生效,其他托管平台自行配等价缓存头。

## 双引擎架构与渲染语义

线上产品只有前端;Python 管线在开发者本地跑,批量生成案例成品图放进 `frontend/public/cases/` 供画廊展示。两套引擎渲染口径一致,同一组参数双端复现同一效果,现场演示可用任一端。

渲染管线共五步,双端同构:

1. BT.601 亮度:`0.299R + 0.587G + 0.114B`,采样成 cols×rows 格子矩阵
2. 预处理:对比度/亮度(Python 走 `ImageEnhance`,JS 以网格均值为轴,语义近似)
3. 阈值掩码:亮度低于阈值的格子画字(前端默认口径:原色模式 + 阈值 170 + 亮度 0.9,上传新图自动回到该口径;Python `RenderParams` 默认 128,复现前端效果需显式传参);`invert` 时反转
4. 边缘检测:一阶差分 `gx + gy > 36` 判定明暗交界;开"加粗边缘"时这些格子强制画字并描边加粗——这是"打印后 3 米外可辨认原图"验收项的关键
5. 短语平铺:从短语逐字取字填格,空格保留为呼吸位;行高 = 字号 × 1.08(CJK 方块字加 8% 余量)

高清导出走矢量重渲染而非放大:Python `render(scale=2)`、JS `paint(layout, params, 2)`,格子矩阵不变、字号等比放大,因此 2x 不发糊。JS 端 `computeLayout` 与渲染分辨率解耦,预览 1x 与导出 2x 落字完全一致;画布最长边上限 4096(移动端内存保护)。

## 模块导航

### backend/wordart(渲染库)

| 模块 | 主要导出 | 说明 |
|---|---|---|
| `engine.py` | `RenderParams`、`TextArtEngine.render()`、`render_text_art(path, params, scale)` | 文字画核心;`RenderParams` 是全部可调参数的 dataclass,构造时校验(text 非空、cols 8-400、threshold 1-255) |
| `sampling.py` | `load_image()`、`luminance_grid()`、`rgb_grid()`、`edge_grid()` | 三条管线共用的采样层,保证同一张图明暗判断一致;`load_image` 做 EXIF 转正、RGB 转换、最长边 2400 限幅 |
| `textart.py` | `render_ascii_text()`、`render_ascii_png()`、`build_phrase_mapping()` | ascii-magic 梯度字符经 `str.translate()` 映射成短语;`map_mode='band'` 按密度分段(推荐,短语大面积连续),`'char'` 逐字符循环 |
| `cloud.py` | `render_word_cloud()`、`normalize_words()` | 词云;词条支持 list / dict / `"名字:权重"` 三种写法;`mask_image` 限制排词区域 |
| `exporter.py` | `save_png()`、`save_pdf()`、`save_text_pdf()` | PDF 用 Pillow 原生 `save(resolution=300)` 直出,单页 A4、居中、12mm 边距,未引入 reportlab |
| `fonts.py` | `find_cjk_font()`、`find_mono_font()` | 按平台(win32/darwin/linux)扫候选路径,找不到 CJK 字体时抛错并给指引 |

### frontend/src(浏览器应用)

| 文件 | 主要导出 | 说明 |
|---|---|---|
| `engine.js` | `DEFAULT_PARAMS`、`computeLayout()`、`paint()`、`buildTextArt()`、`CJK_FONT_STACK` | 渲染引擎,对应 Python 的 engine + sampling;`buildTextArt` 产纯文本供誊抄 |
| `fonts.js` | `FONT_DEFS`、`ensureFont()`、`applyFont()`、`storedFontKey()` | 画字字体加载与切换:system / yrdzst(竹石体) / muyao(沐瑶) 三档;`ensureFont` 依次尝试 COS 源 → 本地兜底,成功即入册 `document.fonts`(按 key 去重、并发只请求一次);`applyFont` 把选中字体排到引擎字体栈首并持久化偏好;手写体未收录字符自动回退系统字体栈 |
| `main.js` | (应用入口,无导出) | `SAMPLES` 六个一键示例(心形/爸爸/朋友/卡通头像/Logo木色/暗底,画廊案例一律原色渲染,参数与 cases.json 对齐:爸爸 阈值145+亮度0.9、朋友 阈值200+对比度1.35+亮度0.95、avatar 阈值 175、logoWood 阈值 215);`PRESETS` 三个参数预设(照片标准 = 原色 + 阈值 170 + 亮度 0.9,与默认口径一致);上传支持点击/拖拽/Ctrl+V 粘贴,用户主动换图时重置回默认口径(原色 + 阈值 170 + 亮度 0.9,保留已输入的那句话,示例/预设参数不串台);参数变动 120ms 防抖重渲染;滑杆右侧数值可点击直接输入(`bindRange` 的 `.val-edit`,回车/失焦提交、Esc 还原、越界自动收拢到滑杆范围并对齐步长);`state.originalSource` 永存原图,裁剪只改 `state.source`;`bindFonts` 接成品预览右上角「画字字体」切换(点击先 `ensureFont` 按需加载,失败回退系统并 toast;启动时恢复 `localStorage` 偏好,字体就绪后自动重渲) |
| `cropper.js` | `openCropper({ url, image, rect, onApply })` | 非破坏性裁剪对话框:归一化裁剪框 {x,y,w,h}∈[0,1],8 手柄 + 框内拖动 + 方向键微调(Shift 加速),Pointer Events 单套逻辑通吃鼠标/触屏;AbortController 管会话事件,Esc/遮罩关闭并归还焦点。压暗语义:页面与对话框保持原亮度,`.crop-veil` 只盖图片本身,clip-path 随框挖孔(外圈顺时针+内圈逆时针的 nonzero 多边形),框外变灰框内亮色;框=全图时面积为零不压暗 |
| `exporter.js` | `exportCanvasPNG()`、`exportCanvasPDF()`、`downloadText()`、`downloadBlob()` | jsPDF 懒加载:点「导出 PDF」才 `import('jspdf')`,主 bundle 不含它(首屏提速关键,弱网首次导出有 toast 提示);无 CDN 依赖;PDF 自动横竖版、居中、12mm 边距 |

## 参数对应表

改参数语义时三处(外加 cases.json)必须联动:

| 语义 | 前端 `engine.js` | Python `RenderParams` | CLI 参数 | cases.json 键 |
|---|---|---|---|---|
| 自定义短语 | `text` | `text` | `--text` | `text` |
| 输出宽度(列数) | `cols`(默认 100) | `cols`(默认 100) | `--cols`(默认 110) | `cols` |
| 渲染模式 | `mode` | `mode` | `--color-mode` | `color_mode` |
| 前景色 | `fgColor` | `fg_color` | `--fg` | `fg` |
| 背景色 | `bgColor` | `bg_color` | `--bg` | `bg` |
| 字号 | `fontSize` | `font_size` | `--font-size` | `font_size` |
| 字间距 | `letterSpacing` | `letter_spacing` | `--spacing` | `spacing` |
| 亮度阈值 | `threshold` | `threshold` | `--threshold` | `threshold` |
| 反转前景/背景 | `invert` | `invert` | `--invert` | `invert` |
| 加粗边缘 | `boldEdges` | `bold_edges` | `--bold-edges` | `bold_edges` |
| 对比度 | `contrast` | `contrast` | `--contrast` | `contrast` |
| 亮度 | `brightness` | `brightness` | `--brightness` | `brightness` |

调参经验(实测):默认口径(原色 + 阈值 170 + 亮度 0.9)对多数照片直出可用;白底卡通/Logo 类阈值取 175-215(小鲶鱼头像 175,秒思 logo 215);暗底亮图(夜景合影)开 `invert` 加 `bold-edges`;整体发灰先拉 `contrast 1.3`;高饱和动漫亮图(路飞)压 `brightness 0.6` + 提 `contrast 1.2` + 阈值 155,让亮色衣服和背景沉下来、轮廓立起来。

## 踩坑记录

| 坑 | 现象 | 处理 |
|---|---|---|
| wordcloud 蒙版语义反直觉 | mask 里纯白像素视为"已占用",直接传图会把白底也排上字 | `cloud.py` 已处理:传 RGB 数组并 `mask[(mask>250).all(axis=-1)] = 255` 抹平浅噪点 |
| 中文 + 等宽字体乱码 | 等宽字体没有中文字形 | `render_ascii_png` 按内容自动选字体:含 CJK 用 `find_cjk_font()`,纯 ASCII 用 `find_mono_font()`,不要手动给中文文本指定等宽字体 |
| ascii-magic 缺库 | 环境没装时纯文本管线不可用 | `textart.py` 内置降级:自研梯度 `" .:-=+*#%@"`,结果同构 |
| npm 安装权限报错 | Windows 下全局缓存路径无写权限 | `npm install --cache .npm-cache`(项目本地缓存) |
| `vite preview` 端口异常 | PowerShell 下端口参数被吞 | `npx vite preview --port 4173 --strictPort` 显式指定 |
| cols 默认值不一致 | 前端 100、RenderParams 100、CLI 110 | 有意为之;cases.json 不写 cols 时走 CLI 默认 110,复现效果时留意 |
| `vite build` 报 EBUSY | emptyDir 在 `rmdir dist/samples` 时 EBUSY:目录句柄被别的进程持有(编辑器文件监听/杀毒/索引),文件本身能删、只有目录删不掉 | 先用 node 脚本只删 dist 内所有文件(`fs.rmSync(force)`,保留目录壳),再 `npx vite build --emptyOutDir=false` 全新写入;残留的旧文件(sphere/橘猫等)顺带清干净 |
| dist 未清空堆积旧产物 | vite emptyOutDir 偶发没执行(Windows 长路径警告环境下),旧 fontsource 字体(390 个 woff2/23MB)与旧 jpg 混进新 dist,网站看似没瘦身 | 构建前手动删掉整个 dist 目录再 `vite build`;构建后核对 dist 树:assets 仅 6 个文件、fonts 4 个、cases/samples 各 6 个 webp、根目录含 `_headers` |

## Git 约定

`main` 单分支,中文 conventional commits(`feat(backend): ...` / `feat(frontend): ...` / `feat(cases): ...`)。奠基三条 + 后续演进(`git log --oneline` 可查全):

- `cf51d5a` 后端离线渲染管线(三条引擎 + 批量 CLI)
- `451f82a` 小鲶鱼头像案例(阈值 175)
- `4eaf8a3` 前端浏览器应用(零上传纯前端)
- 后续:选图建议与裁剪工具、画廊 6 案故事卡 + 自托管字体、veil 挖孔压暗、响应式布局重排(桌面通栏 banner + 手机同屏双栏)等,见 `git log`

不进版本库:`backend/output/`(成品图)、`dist/`、`node_modules/`、`.npm-cache/`。

## 文档导航

| 文档 | 内容 | 何时读 |
|---|---|---|
| `HANDOVER.md` | 项目背景、已锁定决策(无服务器/双引擎/部署/参数语义)、验收标准、风险红线 | 接手任何工作前先读 |
| `spec.md` | 功能分级 F1-F9、非功能需求(隐私/性能/兼容)、技术决策表 | 动渲染或导出逻辑前 |
| `intent.md` | 立项动机与用户场景(恋爱合影、全员姓名拼吉祥物) | 写 PPT、准备展示叙事时 |
| `plan.md` | 周六逐时段时间表、展示脚本、兜底方案 | 排期与展示彩排时 |

## 当前状态与待办

截至 2026-08-29 深夜的进度:

- 后端三条管线可用;`cases.json` 9 条案例(demo_sphere / 路飞语录 / demo_heart_color / demo_sphere_ascii / 小鲶鱼头像 / 爸爸背影 / 朋友恶搞 / 秒思雕刻版 / demo_team_cloud)全部与前端 `SAMPLES` 参数对齐,故事案例一律 `color_mode: color`(爸爸:cols100+字号18+阈值145+亮度0.9;朋友:cols100+字号13+阈值200+对比度1.35+亮度0.95;秒思雕刻版:阈值215+木色前景/背景;路飞:cols100+字号18+阈值155+对比度1.2+亮度0.6,动漫亮图压亮度提对比的典型调法)
- 前端上传、参数面板、实时渲染、四类导出(PNG / 2x / A4 PDF / TXT + 复制)浏览器实测通过,网络面板确认零上传;画廊 6 案故事卡「这份礼物,送给谁?」定稿(按讲述顺序):送恋人「某某我爱你」· 一切从这里开始 / 送爸爸「爸爸我爱你」· 一路走来辛苦了 / 送朋友「夯爆了」· 本来想恶搞你的 / 送公司「秒思」木色 · 打印可当木板雕刻稿 / 送爱好「喜欢的角色」· 用他的语录拼成他的形象(路飞「海贼王我当定了」)/ 送同事「小鲶鱼」· 下一张就是你的(压轴互动位);画廊与示例胶囊全部默认原色渲染,点击即载入全部参数;案例图与示例图全部同源随包,不外链 COS;已部署 https://muse-wordart.pages.dev/
- 默认渲染口径定稿:上传新图默认原色模式 + 亮度阈值 170 + 亮度 0.9(`engine.js` DEFAULT_PARAMS、`index.html` 初值、「照片标准」预设、上传重置四处一致),多数照片零调参直出;用户主动换图自动回到该口径并保留已输入的那句话,示例/预设参数不串台
- 滑杆数值可直接输入:六个滑杆(输出宽度/字号/字间距/阈值/对比度/亮度)右侧数字为 `.val-edit` 输入框,点击输入、回车或失焦提交、Esc 还原,非法输入回退当前值,越界收拢到滑杆范围并对齐步长;提交幂等(Enter 直接 commit + blur 兜底,不依赖程序化 blur 是否派发事件)
- 画字字体三档切换(2026-08-29 完成):成品预览右上角「画字字体」分段控件(系统 / 竹石体 / 沐瑶),字画正文 Canvas 用对应字体渲染;手写字体 COS 加速域名为主源 + 本地 `public/fonts/` TTF 兜底,点选才按需加载(竹石体 ~4.3MB / 沐瑶 ~3.5MB,加载中按钮 loading 态,失败自动回退系统并 toast),`localStorage` 持久化偏好、刷新恢复且字体就绪后自动重渲;预览与导出(1x/2x/PDF)共用同一字体栈;浏览器实测三档切换、COS 源加载与回退均通过,控制台零报错
- 输入卡文案:照片上方「选图建议」保留,一句话输入框上方新增「选字建议:部分文字有些空、不稠密,需要选平替的字」;示例胶囊定为 心形/爸爸/朋友/卡通头像/Logo 五枚(橘猫、球体已删,素材同步移除)
- 裁剪小工具上线(选图建议的可执行版):图片框右上角「裁剪」胶囊常驻,打开对话框后 8 手柄拖拽收近主体;非破坏性——原图与裁剪框分别存在 `originalSource`/`cropRect`,可反复重裁、可还原全图;裁剪在本地 Canvas 截取,零上传红线不受影响;压暗只作用于图片本身(veil 挖孔方案),页面与对话框保持原亮度
- 响应式布局重排(桌面 + 手机同一套叙事):桌面「创作输入」升为壹贰叁正下方的通栏 banner(`.col-input { display: contents }` 拆平分列,`.input-card` 跨 `grid-column: 1 / -1`);手机(≤960px)改为输入通栏置顶 + 下方左「微调」右「成品」双栏同屏,成品卡 `sticky` 吸顶常驻;614px 平板与 390px 手机、纸墨/夜航双主题均实测通过,控制台零报错
- 移动端加载提速(手机 Safari 实测偏慢的对策,2026-08-29 完成):字体按站点字符集子集化为 4 个 woff2(~715KB、preload、font-display: swap,替代 ~2MB 的 fontsource unicode-range 分包,fontsource 依赖已从 package.json 移除);案例图/示例图转 WebP(cases 760px q72 共 ~558KB、samples 1400px q85 共 ~190KB,替代原 ~935KB jpg);jsPDF + html2canvas 拆为懒加载 chunk(首屏 JS ~173KB/gzip ~60KB);`public/_headers` 配 Cloudflare Pages 缓存(assets/fonts 一年 immutable、图片 7 天);dist 手动清空后重建,总产物 2.2MB;`vite preview` 冒烟实测:字体 4 个全加载、画廊 WebP 全就位、案例点击载入正常、控制台零报错
- 展示策略:不做 PPT,周日下午 5 分钟按目标用户矩阵现场活演示,画廊 6 卡即讲述主线(送朋友是压轴互动位:现场给评委的朋友做一张);案例图到此为止,不再新增
- spec.md 对照:F1-F5、F8(复制纯文本)、F9(互动实时重渲染)已落地;F7 未按"预设字符集"实现,改为参数预设(照片标准 / 白底卡通 / 暗底夜景)+ 一键示例;F6 部署已完成
- 待办:把最新 dist(默认原色/阈值170/亮度0.9 + 字体子集化 + WebP + 懒加载 + 缓存头)重新部署到 Cloudflare Pages、周日现场活演示排练、赛后 09-01 仓库工程化整理;提示:墙内访问 pages.dev 受 Cloudflare 中国节点限制,代码侧优化已到头,若现场网络仍慢可提前把 dist 拷到本地双击 `index.html` 兜底(全静态、可离线)
