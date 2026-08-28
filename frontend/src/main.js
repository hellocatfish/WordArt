/**
 * WordArt 前端应用:上传 → 参数 → 实时渲染 → 导出。
 * 所有处理都在浏览器本地完成,零网络请求(隐私红线)。
 */
import { DEFAULT_PARAMS, computeLayout, paint, buildTextArt } from './engine.js'
import { exportCanvasPNG, exportCanvasPDF, downloadText, downloadBlob } from './exporter.js'

const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]

/** 预览画布最长边上限(移动端内存保护);导出走 paint 内置 4096 上限 */
const MAX_PREVIEW_DIM = 2048

/** 一键示例(本地静态图,与 backend demo 参数一致) */
const SAMPLES = {
  sphere: { file: 'samples/sphere.jpg', text: '某某我爱你', threshold: 110, invert: true },
  heart: { file: 'samples/heart.jpg', text: '某某我爱你', mode: 'color', boldEdges: true },
  avatar: { file: 'samples/avatar.jpg', text: '小鲶鱼', threshold: 175 },
  logo: { file: 'samples/logo.jpg', text: '秒思', threshold: 215 },
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
  objectUrl: null,
}

const els = {
  fileInput: $('#file-input'),
  stage: $('#preview-stage'),
  dropEmpty: $('#drop-empty'),
  preview: $('#preview'),
  status: $('#status-line'),
  toast: $('#toast'),
  text: $('#param-text'),
  modeSeg: $('#mode-seg'),
  fgField: $('#fg-field'),
  fg: $('#param-fg'),
  bg: $('#param-bg'),
  btns: {
    png: $('#btn-png'),
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

/* ---------------- 渲染 ---------------- */

let renderTimer = 0
function scheduleRender() {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 120) // 互动重渲染预算 <1s,留足余量
}

function render() {
  if (!state.source) return
  if (!state.params.text.trim()) {
    setStatus('请在右侧输入文字')
    return
  }
  const t0 = performance.now()
  state.layout = computeLayout(state.source, state.params)
  const art = paint(state.layout, state.params, 1, MAX_PREVIEW_DIM)
  const ms = performance.now() - t0

  const pv = els.preview
  pv.width = art.width
  pv.height = art.height
  pv.getContext('2d').drawImage(art, 0, 0)
  pv.hidden = false
  els.dropEmpty.hidden = true

  setStatus(
    `${state.fileName} · ${state.layout.cols}×${state.layout.rows} 格 · 渲染 ${Math.max(1, Math.round(ms))} ms`
  )
  setExportEnabled(true)
}

/* ---------------- 图片载入 ---------------- */

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
  state.objectUrl = null
  state.source = source
  state.fileName = (file.name || 'wordart').replace(/\.[^.]+$/, '') || 'wordart'
  render()
}

async function loadSample(key) {
  const s = SAMPLES[key]
  if (!s) return
  try {
    const res = await fetch(s.file)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    Object.assign(state.params, {
      text: s.text,
      mode: s.mode || 'mono',
      threshold: s.threshold ?? state.params.threshold,
      invert: s.invert ?? false,
      boldEdges: s.boldEdges ?? false,
      contrast: 1,
      brightness: 1,
    })
    syncUI()
    await handleFile(new File([blob], key, { type: blob.type }))
    toast(`已载入示例,试试改成你的话`)
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
    scheduleRender()
  })
  syncFns.push(() => {
    input.value = state.params[key]
    if (out) out.textContent = fmt(input.value)
  })
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
  $('#btn-file').addEventListener('click', () => els.fileInput.click())
  els.dropEmpty.addEventListener('click', () => els.fileInput.click())
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files[0]) handleFile(els.fileInput.files[0])
    els.fileInput.value = ''
  })

  const stop = (e) => e.preventDefault()
  window.addEventListener('dragover', stop)
  window.addEventListener('drop', stop)
  const stage = els.stage
  ;['dragenter', 'dragover'].forEach((ev) =>
    stage.addEventListener(ev, (e) => {
      stop(e)
      stage.classList.add('dragging')
    })
  )
  ;['dragleave', 'dragend'].forEach((ev) =>
    stage.addEventListener(ev, () => stage.classList.remove('dragging'))
  )
  stage.addEventListener('drop', (e) => {
    stop(e)
    stage.classList.remove('dragging')
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
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

  $$('[data-sample]').forEach((chip) =>
    chip.addEventListener('click', () => loadSample(chip.dataset.sample))
  )
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
syncUI()
setExportEnabled(false)
