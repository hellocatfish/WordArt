/**
 * 空状态实时演示 + 通用逐行书写动画。
 *
 * 演示:本地合成心形源图 + 用户当前参数,走真实渲染引擎逐行"写"出来。
 * 用户没传图之前就能看到产品效果,改短语/滑杆立即重渲(所见即所得)。
 *
 * revealDraw 是通用的"逐行书写"入场动画,新图首次渲染时同样使用,
 * 呼应"先看到原图(输入),再看它被一句话写出来(输出)"的叙事。
 *
 * 隐私红线:心形源图纯 Canvas 合成,零网络请求;
 * 无障碍:prefers-reduced-motion 时跳过书写动画,直接静态呈现。
 */
import { computeLayout, paint } from './engine.js'

const FALLBACK_TEXT = '某某我爱你'
const SOURCE_SIZE = 380
const DEMO_REVEAL_MS = 1500

let revealRaf = 0
let canvas = null
let getParams = null
let source = null
let art = null

/** 心形贝塞尔路径 */
function heartPath(ctx, s) {
  ctx.beginPath()
  ctx.moveTo(s * 0.5, s * 0.86)
  ctx.bezierCurveTo(s * 0.12, s * 0.62, s * 0.13, s * 0.13, s * 0.5, s * 0.3)
  ctx.bezierCurveTo(s * 0.87, s * 0.13, s * 0.88, s * 0.62, s * 0.5, s * 0.86)
  ctx.closePath()
}

/** 合成心形源图:深色心形落在浅纸底上,交给引擎按阈值掩码取字 */
function makeHeartSource(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f2ede3'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#1c1917'
  heartPath(ctx, size)
  ctx.fill()
  return c
}

/** 当前参数;短语为空时退回默认短语,演示不中断 */
function resolveParams() {
  const p = { ...getParams() }
  if (!p.text || !p.text.trim()) p.text = FALLBACK_TEXT
  return p
}

function drawFull() {
  canvas.getContext('2d').drawImage(art, 0, 0)
}

/** 用真实引擎重算并铺底(不含入场动画) */
function repaint() {
  const params = resolveParams()
  const layout = computeLayout(source, params)
  art = paint(layout, params, 1)
  canvas.width = art.width
  canvas.height = art.height
  canvas.hidden = false
}

/**
 * 通用逐行书写入场:顶部向下揭示,带一道朱砂书写线。
 * @param {HTMLCanvasElement} target 目标画布(尺寸需与 artCanvas 一致)
 * @param {HTMLCanvasElement} artCanvas 已渲染好的成品画布
 * @param {number} ms 动画时长
 */
export function revealDraw(target, artCanvas, ms = 1200) {
  cancelAnimationFrame(revealRaf)
  const ctx = target.getContext('2d')
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ctx.drawImage(artCanvas, 0, 0)
    return
  }
  const t0 = performance.now()
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms)
    const e = 1 - Math.pow(1 - k, 3) // easeOutCubic
    ctx.clearRect(0, 0, target.width, target.height)
    const h = Math.round(target.height * e)
    if (h > 0) ctx.drawImage(artCanvas, 0, 0, artCanvas.width, h, 0, 0, artCanvas.width, h)
    if (k < 1) {
      ctx.fillStyle = 'rgba(194, 64, 42, 0.85)'
      ctx.fillRect(0, Math.max(0, h - 1), target.width, 2)
      revealRaf = requestAnimationFrame(step)
    }
  }
  revealRaf = requestAnimationFrame(step)
}

/** 停止书写动画(对比原图 / 滑杆重渲时先停笔) */
export function stopReveal() {
  cancelAnimationFrame(revealRaf)
}

/**
 * 启动空状态演示。
 * @param {HTMLCanvasElement} previewCanvas 预览画布(#preview)
 * @param {() => object} paramsGetter 返回当前渲染参数
 */
export function startDemo(previewCanvas, paramsGetter) {
  canvas = previewCanvas
  getParams = paramsGetter
  if (!source) source = makeHeartSource(SOURCE_SIZE)
  repaint()
  revealDraw(canvas, art, DEMO_REVEAL_MS)
}

/** 参数变动后静态重绘(不再重播书写动画,避免拖滑杆时闪烁) */
export function refreshDemo() {
  if (!canvas || !getParams) return
  stopReveal()
  repaint()
  drawFull()
}

/** 用户载入真实图片后交还画布 */
export function stopDemo() {
  stopReveal()
  canvas = null
  getParams = null
}
