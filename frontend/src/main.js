/**
 * WordArt 前端应用:输入(照片 + 一句话) → 实时渲染 → 导出。
 *
 * 布局叙事:左列「创作输入」始终展示用户上传的原图与那句话,
 * 右列「成品预览」实时渲染;新图载入时以逐行书写动画呈现"写出来"的瞬间。
 * 所有处理都在浏览器本地完成;用户图片零上传、零第三方请求(隐私红线),
 * 仅有同源静态资源(字体分包/示例图)按需加载。
 */
// 自托管字体:思源宋体(标题衬线)+ 霞鹜文楷(标语/印章楷体)。
// 两套均为 unicode-range 分包 webfont,浏览器只下载页面真实用到的字块;
// 随 dist 同源部署,访客系统没装这些字体也能还原设计,且不触任何第三方请求。
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/700.css'
import 'lxgw-wenkai-lite-webfont/lxgwwenkailite-regular.css'
import 'lxgw-wenkai-lite-webfont/lxgwwenkailite-bold.css'
import './style.css'
import { DEFAULT_PARAMS, computeLayout, paint, buildTextArt } from './engine.js'
import { exportCanvasPNG, exportCanvasPDF, downloadText } from './exporter.js'
import { startDemo, refreshDemo, stopDemo, revealDraw, stopReveal } from './demo.js'

const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]

/** 预览画布最长边上限(移动端内存保护);导出走 paint 内置 4096 上限 */
const MAX_PREVIEW_DIM = 2048

/** 新图载入后逐行书写动画时长(ms) */
const FRESH_REVEAL_MS = 1100

/** 一键示例(本地静态图,参数与 backend/cases.json 对齐) */
const SAMPLES = {
  sphere: { file: 'samples/sphere.jpg', text: '某某我爱你', cols: 90, threshold: 110, invert: true },
  heart: { file: 'samples/heart.jpg', text: '某某我爱你', mode: 'color', boldEdges: true },
  avatar: { file: 'samples/avatar.jpg', text: '小鲶鱼', threshold: 175 },
  logo: { file: 'samples/logo.jpg', text: '秒思', threshold: 215 },
  // 故事案例:同一颗心能说给谁听
  father: {
    file: 'samples/father.jpg',
    text: '爸爸我爱你',
    cols: 100,
    threshold: 145,
    fgColor: '#26221b',
    bgColor: '#fffdf9',
  },
  cat: {
    file: 'samples/cat.jpg',
    text: '陪我五年',
    cols: 100,
    threshold: 150,
    fgColor: '#9c4312',
    bgColor: '#fff6ea',
  },
  logoWood: {
    file: 'samples/logo.jpg',
    text: '秒思',
    cols: 100,
    threshold: 215,
    fgColor: '#33200d',
    bgColor: '#e8d5a4',
  },
  love: {
    file: 'samples/love.png',
    text: 'WordArt',
    cols: 110,
    threshold: 120,
    invert: true,
    boldEdges: true,
    bgColor: '#0b0b12',
    fgColor: '#f5f5f5',
  },
}

/** 参数预设(覆盖常见图片,现场互动兜底) */
const PRESETS = {
  photo: { threshold: 128, invert: false, boldEdges: false, contrast: 1, brightness: 1 },
  cartoon: { threshold: 175, invert: false, boldEdges: false, contrast: 1, brightness: 1 },
  dark: { threshold: 110, invert: true, boldEdges: true, contrast: 1.15, brightness: 1 },
}

const state = {
  source: null, // ImageBitmap | HTMLImageElement
  fileName: 'wordart',
  layout: null,
  params: { ...DEFAULT_PARAMS },
  objectUrl: null, // 输入卡里展示原图用的 blob URL
  lastArt: null, // 最近一次预览成品(长按对比原图用)
  fresh: false, // 新图首次渲染 → 播逐行书写动画
}

const els = {
  fileInput: $('#file-input'),
  photoSlot: $('#photo-slot'),
  photoEmpty: $('#photo-empty'),
  sourceImg: $('#source-img'),
  photoMeta: $('#photo-meta'),
  btnReplace: $('#btn-replace'),
  stage: $('#preview-stage'),
  preview: $('#preview'),
  status: $('#status-line'),
  toast: $('#toast'),
  themeToggle: $('#theme-toggle'),
  text: $('#param-text'),
  modeSeg: $('#mode-seg'),
  fgField: $('#fg-field'),
  fg: $('#param-fg'),
  bg: $('#param-bg'),
  btns: {
    png: $('#btn-png'),
    cmp: $('#btn-compare'),
    png2x: $('#btn-png2x'),
    pdf: $('#btn-pdf'),
    copy: $('#btn-copy'),
    txt: $('#btn-txt'),
  },
}

/* ---------------- 小组件 ---------------- */

let toastTimer = 0
function toast(msg) {
  els.toast.textContent = msg
  els.toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200)
}

function setStatus(msg) {
  els.status.textContent = msg
}

function setExportEnabled(on) {
  Object.values(els.btns).forEach((b) => (b.disabled = !on))
}

const safeName = (s) => (s || 'wordart').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)

/* ---------------- 主题切换:纸墨信笺 / 夜航毛玻璃 ---------------- */

const THEME_KEY = 'wordart-theme'
const THEME_META_COLOR = { paper: '#c2402a', night: '#0a0d13' }

function applyTheme(theme) {
  const next = theme === 'night' ? 'night' : 'paper'
  document.documentElement.dataset.theme = next
  const night = next === 'night'
  if (els.themeToggle) {
    els.themeToggle.setAttribute('aria-label', night ? '切换到纸墨模式' : '切换到夜航模式')
    els.themeToggle.title = night ? '切回纸墨信笺' : '切换夜航毛玻璃模式'
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_META_COLOR[next])
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    /* 隐私模式下静默降级:仅本次会话生效 */
  }
}

// 首屏主题已由 index.html 内联脚本预置,这里只做同步与绑定
applyTheme(document.documentElement.dataset.theme || 'paper')
els.themeToggle?.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'night' ? 'paper' : 'night')
})

/* ---------------- 渲染 ---------------- */

let renderTimer = 0
function scheduleRender() {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 120) // 互动重渲染预算 <1s,留足余量
}

function render() {
  if (!state.source) {
    refreshDemo() // 空状态:内置心形 + 当前参数实时演示
    return
  }
  if (comparing) setCompare(false)
  if (!state.params.text.trim()) {
    setStatus('先在左侧「你想说的话」里写点什么吧')
    return
  }
  const t0 = performance.now()
  state.layout = computeLayout(state.source, state.params)
  const art = paint(state.layout, state.params, 1, MAX_PREVIEW_DIM)
  state.lastArt = art
  const ms = performance.now() - t0

  const pv = els.preview
  pv.width = art.width
  pv.height = art.height
  pv.hidden = false

  if (state.fresh) {
    // 新图:先见原图(输入卡),再看它被逐行"写"成画
    state.fresh = false
    revealDraw(pv, art, FRESH_REVEAL_MS)
  } else {
    stopReveal()
    pv.getContext('2d').drawImage(art, 0, 0)
  }

  setStatus(
    `${state.fileName} · ${state.layout.cols}×${state.layout.rows} 格 · 渲染 ${Math.max(1, Math.round(ms))} ms`
  )
  setExportEnabled(true)
}

/* ---------------- 图片载入 ---------------- */

/** 输入卡展示用户原图(真实输入始终可见) */
function showSource(file) {
  const w = state.source.width || state.source.naturalWidth || 0
  const h = state.source.height || state.source.naturalHeight || 0
  els.sourceImg.src = state.objectUrl
  els.sourceImg.hidden = false
  els.photoEmpty.hidden = true
  els.btnReplace.hidden = false
  els.photoMeta.hidden = false
  els.photoMeta.textContent = `${file.name} · ${w} × ${h}`
  els.photoSlot.classList.add('filled')
  els.photoSlot.setAttribute('aria-label', '更换图片')
}

async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('请选择图片文件')
    return
  }
  let source
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // 退路:HTMLImageElement(现代浏览器绘制 <img> 时同样遵循 EXIF 方向)
    try {
      source = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('图片解析失败'))
        }
        img.src = url
      })
    } catch {
      toast('这张图片无法解析,换一张试试')
      return
    }
  }
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl)
  state.objectUrl = URL.createObjectURL(file)
  state.source = source
  state.fileName = (file.name || 'wordart').replace(/\.[^.]+$/, '') || 'wordart'
  state.fresh = true
  showSource(file)
  stopDemo()
  render()
}

/** 载入内置示例;scrollUp 为 true 时(画廊点击)滚回工作台 */
async function loadSample(key, scrollUp = false) {
  const s = SAMPLES[key]
  if (!s) return
  try {
    const res = await fetch(s.file)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    Object.assign(state.params, {
      text: s.text,
      mode: s.mode || 'mono',
      cols: s.cols ?? state.params.cols,
      threshold: s.threshold ?? state.params.threshold,
      invert: s.invert ?? false,
      boldEdges: s.boldEdges ?? false,
      contrast: 1,
      brightness: 1,
      bgColor: s.bgColor || '#ffffff',
      fgColor: s.fgColor || '#1a1a1a',
    })
    syncUI()
    await handleFile(new File([blob], key, { type: blob.type }))
    toast('已载入案例,改成你的话试试')
    if (scrollUp) $('#studio').scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch {
    toast('示例图载入失败')
  }
}

/* ---------------- 导出 ---------------- */

function exportPNG(multiplier) {
  const art = paint(state.layout, state.params, multiplier)
  exportCanvasPNG(art, `${safeName(state.fileName)}${multiplier > 1 ? '@2x' : ''}.png`)
  toast(multiplier > 1 ? '已导出 2x 高清 PNG' : '已导出 PNG')
}

function exportPDF() {
  const art = paint(state.layout, state.params, 2)
  exportCanvasPDF(art, `${safeName(state.fileName)}.pdf`)
  toast('已导出 A4 PDF,打印即成品')
}

function exportTXT() {
  downloadText(buildTextArt(state.layout, state.params), `${safeName(state.fileName)}.txt`)
}

async function copyText() {
  const text = buildTextArt(state.layout, state.params)
  try {
    await navigator.clipboard.writeText(text)
    toast('已复制,可直接粘贴誊抄')
  } catch {
    // 非安全上下文退路
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    toast(ok ? '已复制,可直接粘贴誊抄' : '复制失败,请用「下载 TXT」')
  }
}

/* ---------------- 参数面板绑定 ---------------- */

const syncFns = []

function bindRange(inputId, key, valId, fmt = (v) => v) {
  const input = $('#' + inputId)
  const out = $('#' + valId)
  input.addEventListener('input', () => {
    state.params[key] = Number(input.value)
    if (out) out.textContent = fmt(input.value)
    paintRangeFill(input)
    scheduleRender()
  })
  syncFns.push(() => {
    input.value = state.params[key]
    if (out) out.textContent = fmt(input.value)
    paintRangeFill(input)
  })
}

/** 滑杆已选段填充(--p 百分比,配合 CSS 渐变轨道) */
function paintRangeFill(input) {
  const min = Number(input.min)
  const max = Number(input.max)
  const p = ((Number(input.value) - min) / (max - min)) * 100
  input.style.setProperty('--p', `${p}%`)
}

function bindColor(inputId, key) {
  const input = $('#' + inputId)
  input.addEventListener('input', () => {
    state.params[key] = input.value
    scheduleRender()
  })
  syncFns.push(() => (input.value = state.params[key]))
}

function bindSwitch(inputId, key) {
  const input = $('#' + inputId)
  input.addEventListener('change', () => {
    state.params[key] = input.checked
    scheduleRender()
  })
  syncFns.push(() => (input.checked = !!state.params[key]))
}

function syncModeUI() {
  $$('#mode-seg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === state.params.mode)
  )
  const color = state.params.mode === 'color'
  els.fg.disabled = color
  els.fgField.classList.toggle('disabled', color)
}

function syncUI() {
  els.text.value = state.params.text
  els.bg.value = state.params.bgColor
  els.fg.value = state.params.fgColor
  syncFns.forEach((fn) => fn())
  syncModeUI()
}

function bindAll() {
  bindRange('param-cols', 'cols', 'val-cols')
  bindRange('param-fs', 'fontSize', 'val-fs')
  bindRange('param-ls', 'letterSpacing', 'val-ls')
  bindRange('param-th', 'threshold', 'val-th')
  bindRange('param-ct', 'contrast', 'val-ct', (v) => Number(v).toFixed(2))
  bindRange('param-br', 'brightness', 'val-br', (v) => Number(v).toFixed(2))
  bindColor('param-bg', 'bgColor')
  bindColor('param-fg', 'fgColor')
  bindSwitch('param-invert', 'invert')
  bindSwitch('param-edges', 'boldEdges')

  els.text.addEventListener('input', () => {
    state.params.text = els.text.value
    scheduleRender()
  })

  els.modeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]')
    if (!btn) return
    state.params.mode = btn.dataset.mode
    syncModeUI()
    scheduleRender()
  })

  $$('[data-preset]').forEach((btn) =>
    btn.addEventListener('click', () => {
      Object.assign(state.params, PRESETS[btn.dataset.preset])
      syncUI()
      scheduleRender()
      toast('已应用预设')
    })
  )

  $('#btn-reset').addEventListener('click', () => {
    state.params = { ...DEFAULT_PARAMS }
    syncUI()
    scheduleRender()
    toast('已恢复默认参数')
  })
}

/* ---------------- 上传交互:点击 / 拖拽 / 粘贴 ---------------- */

function bindUpload() {
  const pick = () => els.fileInput.click()

  els.photoSlot.addEventListener('click', pick)
  els.photoSlot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick()
    }
  })
  els.btnReplace.addEventListener('click', pick)
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files[0]) handleFile(els.fileInput.files[0])
    els.fileInput.value = ''
  })

  // 拖拽:照片槽与预览台都接收,高亮落在照片槽上
  const stop = (e) => e.preventDefault()
  window.addEventListener('dragover', stop)
  window.addEventListener('drop', stop)
  const mark = (on) => els.photoSlot.classList.toggle('dragging', on)
  ;[els.photoSlot, els.stage].forEach((el) => {
    ;['dragenter', 'dragover'].forEach((ev) =>
      el.addEventListener(ev, (e) => {
        stop(e)
        mark(true)
      })
    )
    ;['dragleave', 'dragend'].forEach((ev) =>
      el.addEventListener(ev, (e) => {
        if (!el.contains(e.relatedTarget)) mark(false)
      })
    )
    el.addEventListener('drop', (e) => {
      stop(e)
      mark(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) handleFile(file)
    })
  })

  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
    if (item) {
      const file = item.getAsFile()
      if (file) {
        handleFile(file)
        toast('已读取剪贴板图片')
      }
    }
  })

  // 输入卡里的示例胶囊
  $$('[data-sample]').forEach((chip) =>
    chip.addEventListener('click', () => loadSample(chip.dataset.sample))
  )

  // 画廊案例:一键载入工作台并滚回去看效果
  $$('[data-gallery]').forEach((card) => {
    const go = () => loadSample(card.dataset.gallery, true)
    card.addEventListener('click', go)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        go()
      }
    })
  })
}

/* ---------------- 长按对比原图(展示讲故事的抓手) ---------------- */

let comparing = false

/** 原图等比居中铺进预览画布 */
function drawContain(ctx, src, w, h) {
  const iw = src.naturalWidth || src.width
  const ih = src.naturalHeight || src.height
  const k = Math.min(w / iw, h / ih)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k)
}

/** 按住显示原图,松开回到文字画成品 */
function setCompare(on) {
  if (!state.source || !state.lastArt || on === comparing) return
  comparing = on
  stopReveal()
  const pv = els.preview
  const ctx = pv.getContext('2d')
  pv.width = state.lastArt.width
  pv.height = state.lastArt.height
  if (on) {
    drawContain(ctx, state.source, pv.width, pv.height)
    els.stage.classList.add('comparing')
  } else {
    ctx.drawImage(state.lastArt, 0, 0)
    els.stage.classList.remove('comparing')
  }
}

function bindCompare() {
  const btn = els.btns.cmp
  if (!btn) return
  const release = () => setCompare(false)
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    setCompare(true)
  })
  ;['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    btn.addEventListener(ev, release)
  )
  // 键盘可达:按住空格/回车同样对比
  btn.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault()
      setCompare(true)
    }
  })
  btn.addEventListener('keyup', release)
  btn.addEventListener('contextmenu', (e) => e.preventDefault()) // 触屏长按不弹菜单
}

/* ---------------- 启动 ---------------- */

function bindExports() {
  els.btns.png.addEventListener('click', () => exportPNG(1))
  els.btns.png2x.addEventListener('click', () => exportPNG(2))
  els.btns.pdf.addEventListener('click', exportPDF)
  els.btns.txt.addEventListener('click', exportTXT)
  els.btns.copy.addEventListener('click', copyText)
}

bindAll()
bindUpload()
bindExports()
bindCompare()
syncUI()
setExportEnabled(false)
startDemo(els.preview, () => state.params)
