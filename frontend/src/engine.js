/**
 * WordArt 浏览器端渲染引擎(Canvas 2D)。
 *
 * 与 backend/wordart/engine.py 保持同一套口径,方便双端效果对齐:
 *   BT.601 亮度 → 对比度/亮度预处理 → 阈值掩码(可反转)
 *   → 明暗交界边缘(可选加粗)→ 自定义短语逐格平铺(空格为呼吸位)
 *
 * 隐私红线:图片只在本地 Canvas 采样,全程零网络请求。
 */

/** CJK 字体栈(HANDOVER 风险红线:浏览器 Canvas 必须显式指定 CJK 字体) */
export const CJK_FONT_STACK =
  '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif'

/**
 * 画字字体栈:默认系统黑体;切换到 COS 手写字体(杨任东竹石体 / 沐瑶随心手写体)时,
 * 由 fonts.js 调用 setCJKFontStack 把该手写字体家族排到栈首,未收录字符仍回退系统字体。
 * paint() 读取当前值,因此预览与导出(1x/2x/PDF)会自然使用同一种画字字体。
 */
let activeFontStack = CJK_FONT_STACK

export function setCJKFontStack(stack) {
  activeFontStack = stack || CJK_FONT_STACK
}

export function getCJKFontStack() {
  return activeFontStack
}

/** 边缘判定灵敏度,与 Python 端 edge_grid(sensitivity=36) 一致 */
const EDGE_SENSITIVITY = 36
/** CJK 方块字行高余量,避免上下行贴死(Python 端 _ROW_HEIGHT_FACTOR) */
const ROW_HEIGHT_FACTOR = 1.08

export const DEFAULT_PARAMS = {
  text: '某某我爱你',
  cols: 100, // 输出宽度(列数,决定分辨率)
  mode: 'color', // 渲染模式:mono=单色 / color=原色(默认原色:案例口径统一,照片直出彩色)
  fgColor: '#1a1a1a',
  bgColor: '#ffffff',
  fontSize: 18,
  letterSpacing: 0,
  threshold: 170, // 亮度阈值:低于阈值画字(实测 170 对多数照片/卡通都成立)
  invert: false, // 反转前景/背景(暗底亮图开)
  boldEdges: false, // 加粗边缘:明暗交界处强制画字并加粗
  contrast: 1,
  brightness: 0.9,
}

/* ---------------- 基础工具 ---------------- */

function hexToRgb(hex) {
  const m = String(hex || '').replace('#', '').trim()
  const v = m.length === 3 ? [...m].map((ch) => ch + ch).join('') : m
  const n = parseInt(v || '000000', 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const rgbCss = (r, g, b) => `rgb(${r},${g},${b})`
const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

/* ---------------- 采样 ---------------- */

/** 图片 → cols×rows 亮度矩阵 + 每格 RGB(原色模式用) */
function sampleGrid(source, cols, rows) {
  const off = document.createElement('canvas')
  off.width = cols
  off.height = rows
  const ctx = off.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, cols, rows)
  const data = ctx.getImageData(0, 0, cols, rows).data
  const n = cols * rows
  const lum = new Float32Array(n)
  const rgb = new Uint8ClampedArray(n * 3)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b // BT.601
    rgb[i * 3] = r
    rgb[i * 3 + 1] = g
    rgb[i * 3 + 2] = b
  }
  return { lum, rgb }
}

/** 对比度/亮度预处理:以网格均值为轴(贴近 PIL ImageEnhance 语义) */
function applyTone(lum, contrast, brightness) {
  if (contrast === 1 && brightness === 1) return lum
  const n = lum.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += lum[i]
  mean /= n
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = (lum[i] - mean) * contrast + mean
    v *= brightness
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v
  }
  return out
}

/** 一阶差分边缘:True = 明暗交界(Python 端 edge_grid 同口径) */
function detectEdges(lum, cols, rows) {
  const edges = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const gx = c > 0 ? Math.abs(lum[i] - lum[i - 1]) : 0
      const gy = r > 0 ? Math.abs(lum[i] - lum[i - cols]) : 0
      if (gx + gy > EDGE_SENSITIVITY) edges[i] = 1
    }
  }
  return edges
}

/* ---------------- 布局(与渲染分辨率解耦,可多倍率重绘) ---------------- */

/**
 * 计算布局:格子矩阵 + 掩码。只依赖参数,与输出倍率无关,
 * 因此预览 1x 与导出 2x 落字完全一致(矢量级放大,不发糊)。
 */
export function computeLayout(source, params) {
  const iw = source.naturalWidth || source.width
  const ih = source.naturalHeight || source.height
  const cellW = params.fontSize + params.letterSpacing
  const cellH = params.fontSize * ROW_HEIGHT_FACTOR
  const rows = Math.max(1, Math.round(params.cols * (ih / iw) * (cellW / cellH)))
  const { lum, rgb } = sampleGrid(source, params.cols, rows)

  const enh = applyTone(lum, params.contrast, params.brightness)
  const n = params.cols * rows
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = enh[i] < params.threshold ? 1 : 0
  if (params.invert) for (let i = 0; i < n; i++) mask[i] ^= 1

  let edges = null
  if (params.boldEdges) {
    edges = detectEdges(enh, params.cols, rows)
    for (let i = 0; i < n; i++) if (edges[i]) mask[i] = 1
  }
  return { cols: params.cols, rows, mask, edges, rgb, width: iw, height: ih }
}

/* ---------------- 绘制 ---------------- */

/** 原色模式的可读性保护:字色不能和背景混在一起(Python 端同口径) */
function readableColor(r, g, b, bgLight) {
  return bgLight
    ? rgbCss(Math.min(r, 200), Math.min(g, 200), Math.min(b, 200))
    : rgbCss(Math.max(r, 55), Math.max(g, 55), Math.max(b, 55))
}

/**
 * 把布局绘制到新画布。
 * @param scale 输出倍率:字号/格宽等比放大,格子矩阵不变(高清不发糊)
 * @param maxDim 画布最长边上限(移动端画布内存保护)
 */
export function paint(layout, params, scale = 1, maxDim = 4096) {
  const { cols, rows, mask, edges, rgb } = layout
  const fontSize = params.fontSize * scale
  const cellW = (params.fontSize + params.letterSpacing) * scale
  const cellH = fontSize * ROW_HEIGHT_FACTOR

  // 内存保护:超限时按比例压低倍率
  const cap = Math.min(scale, maxDim / Math.max(cols * cellW, rows * cellH))
  const fs = fontSize * (cap / scale)
  const cw = cellW * (cap / scale)
  const ch = cellH * (cap / scale)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cols * cw))
  canvas.height = Math.max(1, Math.round(rows * ch))
  const ctx = canvas.getContext('2d')

  const bg = hexToRgb(params.bgColor)
  ctx.fillStyle = rgbCss(bg.r, bg.g, bg.b)
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const chars = Array.from(params.text.trim())
  if (!chars.length) return canvas

  const fg = hexToRgb(params.fgColor)
  const fgCss = rgbCss(fg.r, fg.g, fg.b)
  const bgLight = lumOf(bg.r, bg.g, bg.b) >= 128
  const strokeW = Math.max(1, fs / 14)

  ctx.font = `${fs}px ${activeFontStack}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'

  let counter = 0
  for (let r = 0; r < rows; r++) {
    const cy = r * ch + ch / 2
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (!mask[i]) continue
      const ch2 = chars[counter++ % chars.length]
      if (ch2 === ' ') continue // 短语中的空格保留为呼吸位
      const cx = c * cw + cw / 2
      let fill
      if (params.mode === 'color') {
        const o = i * 3
        fill = readableColor(rgb[o], rgb[o + 1], rgb[o + 2], bgLight)
      } else {
        fill = fgCss
      }
      if (edges && edges[i]) {
        ctx.lineWidth = strokeW
        ctx.strokeStyle = fill
        ctx.strokeText(ch2, cx, cy)
      }
      ctx.fillStyle = fill
      ctx.fillText(ch2, cx, cy)
    }
  }
  return canvas
}

/* ---------------- 纯文本版(供手写誊抄) ---------------- */

export function buildTextArt(layout, params) {
  const { cols, rows, mask } = layout
  const chars = Array.from(params.text.trim())
  if (!chars.length) return ''
  let counter = 0
  const lines = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      if (mask[r * cols + c]) line += chars[counter++ % chars.length]
      else line += ' '
    }
    lines.push(line.replace(/\s+$/, ''))
  }
  return lines.join('\n')
}
