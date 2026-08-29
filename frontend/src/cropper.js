/**
 * WordArt 前端裁剪小工具:「选图建议」的可执行版。
 *
 * 非破坏性:始终基于上传原图计算归一化裁剪框 {x,y,w,h} ∈ [0,1],
 * 应用时才由调用方用 Canvas 从原图截取——不经任何网络(隐私红线)。
 *
 * 压暗语义:页面与对话框保持原亮度,变灰只发生在图片本身——
 * .crop-veil 覆盖整图,clip-path 随裁剪框挖孔,框内保持亮色。
 *
 * 交互:框内拖动移动、8 个手柄缩放、方向键微调(Shift 加速)、
 * Esc / 点遮罩取消。全部走 Pointer Events,鼠标与触屏同一套逻辑。
 */

const $ = (s) => document.querySelector(s)

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/** 显示坐标下的最小裁剪边:6% 兜底 28px(防手柄拖死),封顶一半 */
const minSide = (span) => Math.min(Math.max(28, span * 0.06), span * 0.5)

/**
 * 打开裁剪对话框(单例,同时只存在一个会话)。
 * @param url    原图 blob URL(仅用于 <img> 展示)
 * @param image  原图(ImageBitmap | HTMLImageElement),只读其宽高
 * @param rect   已有归一化裁剪框,null 表示全图
 * @param onApply 应用回调,收到归一化矩形(可能近似全图)
 */
export function openCropper({ url, image, rect, onApply }) {
  const overlay = $('#crop-overlay')
  const wrap = $('#crop-wrap')
  const img = $('#crop-img')
  const veil = $('#crop-veil') // 图片压暗层(框外变灰,框内亮色)
  const box = $('#crop-box')
  const size = $('#crop-size') // 尺寸读数
  const btnReset = $('#btn-crop-reset')
  const btnCancel = $('#btn-crop-cancel')
  const btnApply = $('#btn-crop-apply')

  const nw = image.naturalWidth || image.width
  const nh = image.naturalHeight || image.height

  // 会话级事件:AbortController 一次性回收,重复打开不叠监听
  const ctrl = new AbortController()
  const { signal } = ctrl

  let W = 0 // 图显示宽(px)
  let H = 0 // 图显示高(px)
  let cur = { l: 0, t: 0, w: 0, h: 0 } // 裁剪框(显示坐标 px)

  const opener = document.activeElement // 关闭后归还焦点

  function paintBox(r) {
    cur = r
    box.style.left = `${r.l}px`
    box.style.top = `${r.t}px`
    box.style.width = `${r.w}px`
    box.style.height = `${r.h}px`
    // 压暗层挖孔:外圈(整图)顺时针 + 内圈(裁剪框)逆时针,
    // nonzero 填充下连接线相互抵消 → 中间带孔的"相框"。
    // 框=全图时内外圈重合、面积为零,不压暗(初始态图片全亮)
    veil.style.clipPath =
      `polygon(0px 0px, ${W}px 0px, ${W}px ${H}px, 0px ${H}px, 0px 0px, ` +
      `${r.l}px ${r.t}px, ${r.l}px ${r.t + r.h}px, ${r.l + r.w}px ${r.t + r.h}px, ` +
      `${r.l + r.w}px ${r.t}px, ${r.l}px ${r.t}px)`
    const k = W / nw || 1
    size.textContent = `裁剪为 ${Math.round(r.w / k)} × ${Math.round(r.h / k)}(原图 ${nw} × ${nh})`
  }

  const fromNormalized = (n) => ({
    l: clamp(n.x, 0, 1) * W,
    t: clamp(n.y, 0, 1) * H,
    w: clamp(n.w, 0, 1) * W,
    h: clamp(n.h, 0, 1) * H,
  })

  const normalized = () => ({ x: cur.l / W, y: cur.t / H, w: cur.w / W, h: cur.h / H })

  function close() {
    ctrl.abort()
    overlay.classList.remove('open')
    // reduced-motion 下过渡被禁,延迟仅为等淡出;无碍
    setTimeout(() => {
      overlay.hidden = true
      img.removeAttribute('src')
    }, 190)
    document.body.style.overflow = ''
    opener?.focus?.()
  }

  /* ---------- 图片就绪:定显示尺寸与初始框 ---------- */
  img.addEventListener(
    'load',
    () => {
      W = img.clientWidth
      H = img.clientHeight
      paintBox(rect ? fromNormalized(rect) : { l: 0, t: 0, w: W, h: H })
      box.focus({ preventScroll: true })
    },
    { signal }
  )

  /* ---------- 指针拖拽:移动 / 手柄缩放 ---------- */
  let drag = null // { dir, sx, sy, orig }

  wrap.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || !W) return
      const hd = e.target.closest('.hd')
      const inBox = !hd && e.target.closest('.crop-box')
      if (!hd && !inBox) return
      drag = { dir: hd ? hd.dataset.dir : 'move', sx: e.clientX, sy: e.clientY, orig: { ...cur } }
      wrap.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    { signal }
  )

  wrap.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      const o = drag.orig

      if (drag.dir === 'move') {
        paintBox({
          l: clamp(o.l + dx, 0, W - o.w),
          t: clamp(o.t + dy, 0, H - o.h),
          w: o.w,
          h: o.h,
        })
        return
      }

      // 缩放:按方向字母锁定不动边,推移动边
      let { l, t } = o
      let r = o.l + o.w
      let b = o.t + o.h
      if (drag.dir.includes('w')) l = clamp(o.l + dx, 0, W)
      if (drag.dir.includes('e')) r = clamp(o.l + o.w + dx, 0, W)
      if (drag.dir.includes('n')) t = clamp(o.t + dy, 0, H)
      if (drag.dir.includes('s')) b = clamp(o.t + o.h + dy, 0, H)

      const mw = minSide(W)
      const mh = minSide(H)
      if (r - l < mw) {
        if (drag.dir.includes('e')) r = Math.min(l + mw, W)
        else l = Math.max(r - mw, 0)
      }
      if (b - t < mh) {
        if (drag.dir.includes('s')) b = Math.min(t + mh, H)
        else t = Math.max(b - mh, 0)
      }
      paintBox({ l, t, w: Math.max(1, r - l), h: Math.max(1, b - t) })
    },
    { signal }
  )

  const endDrag = (e) => {
    if (!drag) return
    drag = null
    try {
      wrap.releasePointerCapture(e.pointerId)
    } catch {
      /* 指针已离开,忽略 */
    }
  }
  wrap.addEventListener('pointerup', endDrag, { signal })
  wrap.addEventListener('pointercancel', endDrag, { signal })

  /* ---------- 键盘:方向键移动(Shift 加速) ---------- */
  box.addEventListener(
    'keydown',
    (e) => {
      if (!W || !H) return
      const step = e.shiftKey ? 0.05 : 0.01
      let { l, t, w, h } = cur
      switch (e.key) {
        case 'ArrowLeft': l = clamp(l - W * step, 0, W - w); break
        case 'ArrowRight': l = clamp(l + W * step, 0, W - w); break
        case 'ArrowUp': t = clamp(t - H * step, 0, H - h); break
        case 'ArrowDown': t = clamp(t + H * step, 0, H - h); break
        default: return
      }
      e.preventDefault()
      paintBox({ l, t, w, h })
    },
    { signal }
  )

  /* ---------- 按钮 / 遮罩 / Esc ---------- */
  btnReset.addEventListener('click', () => W && paintBox({ l: 0, t: 0, w: W, h: H }), { signal })
  btnCancel.addEventListener('click', close, { signal })
  overlay.addEventListener('click', (e) => e.target === overlay && close(), { signal })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }, { signal })

  btnApply.addEventListener(
    'click',
    () => {
      if (!W || !H) return
      const n = normalized()
      close()
      onApply(n)
    },
    { signal }
  )

  /* ---------- 视口变化:等比重建显示坐标 ---------- */
  window.addEventListener(
    'resize',
    () => {
      if (!W || !img.clientWidth) return
      const n = normalized()
      W = img.clientWidth
      H = img.clientHeight
      paintBox(fromNormalized(n))
    },
    { signal }
  )

  /* ---------- 启动 ---------- */
  overlay.hidden = false
  document.body.style.overflow = 'hidden' // 锁滚动,拖拽不串台
  requestAnimationFrame(() => overlay.classList.add('open'))
  img.src = url
}
