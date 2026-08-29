# WordArt 前端(浏览器版)

纯前端静态应用:上传图片 → 输入一句话 → 实时生成由这句话平铺而成的字符画 → 导出 PNG / PDF / TXT。

**隐私红线:图片只在浏览器本地 Canvas 采样,全程零网络请求,可离线使用。**

## 快速开始

```bash
cd frontend
npm install
npm run dev       # 开发: http://localhost:5173
npm run build     # 产出 dist/ 静态站点
npm run preview    # 本地预览 dist
```

`dist/` 是纯静态产物,可直接扔到任意静态托管(GitHub Pages / OSS / 内网共享盘),双击 `index.html` 亦可离线使用。

## 功能

| 功能 | 说明 |
| --- | --- |
| 图片输入 | 点击选择 / 拖拽 / `Ctrl+V` 粘贴截图;右上角「裁剪」可非破坏性收近主体 |
| 一键示例 | 心形、爸爸、朋友、卡通头像、Logo 五个内置样图,点击载入图片 + 全部参数 |
| 实时渲染 | 所有参数拖动即重绘(典型 100 列 < 100ms) |
| 渲染模式 | 单色(自选前景/背景色)/ 原色(按原图着色,自动保可读性);案例一律原色 |
| 明暗控制 | 亮度阈值、对比度、亮度、反转、加粗边缘;滑杆数值可点击直接输入(回车/失焦提交,越界自动收拢) |
| 输入建议 | 照片上方「选图建议」,一句话输入框上方「选字建议」 |
| 预设 | 照片标准 / 白底卡通·Logo / 暗底·夜景 |
| 导出 | PNG 1x、PNG 2x(矢量级放大不发糊)、A4 单页 PDF(自动横竖版,打印即礼物)、TXT(纯文本,可誊抄) |

## 渲染口径(与 Python 后端一致)

`src/engine.js` 与 `backend/wordart/engine.py` 保持同一套算法,双端效果对齐:

1. BT.601 亮度采样(`0.299R + 0.587G + 0.114B`)
2. 对比度/亮度预处理(以网格均值为轴,贴近 PIL ImageEnhance)
3. 阈值掩码:低于阈值画字,可反转
4. 一阶差分边缘(灵敏度 36):可选在明暗交界处强制画字并描边加粗
5. 自定义短语逐格平铺,短语中的空格保留为呼吸位

关键实现:布局(`computeLayout`)与渲染分辨率解耦,预览 1x 与导出 2x 落字完全一致;画布最长边上限 4096(移动端内存保护)。CJK 字体栈显式指定,规避中文渲染红线。

## 目录结构

```
frontend/
├── index.html          # 页面结构:工作区(预览+参数)+ 案例画廊
├── vite.config.js
├── src/
│   ├── engine.js       # 渲染引擎:采样/掩码/边缘/平铺/绘制
│   ├── exporter.js     # 导出:PNG / jsPDF(A4)/ TXT 下载
│   ├── main.js         # 应用逻辑:上传/参数绑定/示例/预设/交互
│   └── style.css       # 样式
└── public/
    ├── samples/        # 一键示例图(与 backend/cases.json 参数一致)
    ├── cases/          # 案例画廊图(送恋人/送爸爸/送朋友/送公司/送同事/送爱好)
    └── favicon.svg
```

## 依赖

- [Vite 5](https://vitejs.dev/) 构建,运行时零框架
- [jsPDF](https://github.com/parallax/jsPDF) PDF 导出(打包进本地产物,无 CDN)

## 与后端的关系

前端覆盖互动主链路(文字画);词云等重计算仍走 `backend/` Python 管线(`python backend/batch.py`),产物图放入 `public/cases/` 供画廊展示。参数语义双端一致,现场演示可用同一组参数复现同一效果。
