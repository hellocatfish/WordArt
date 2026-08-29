/**
 * 画字字体(手写字体)加载。
 *
 * 字体的使用场景:字画正文 Canvas 渲染用的「画字字体」,与页面 UI 字体(思源宋体/霞鹜文楷)无关。
 * 三档可选:系统黑体(默认) / 杨任东竹石体(硬笔手写) / 沐瑶随心手写体(中性笔手写)。
 *
 * 字体源策略:COS 加速域名为主源(用户自建 CDN,免首屏下载、不发包进 dist),
 * 本地 public/fonts/ 同款副本兜底——COS 未配 CORS / 弱网 / 离线时自动回退同源文件,
 * 演示永不因字体缺失而白屏。仅在用户点开「竹石体 / 沐瑶」时才按需加载(~4MB / ~3.3MB),
 * 首屏零额外下载,系统档不触发任何字体请求。
 *
 * 注意:浏览器跨域加载字体受 CORS 限制,COS 桶需配置跨域规则(允许来源 + GET/HEAD),
 * 否则走不到 COS 源、直接落到本地兜底(仍可用,只是不是 CDN 路径)。
 */
import { setCJKFontStack, CJK_FONT_STACK } from './engine.js'

/** 画字字体定义;key 与 index.html 字体切换按钮的 data-font 一一对应 */
export const FONT_DEFS = {
  system: {
    label: '系统',
    family: '',
    sources: [],
  },
  yrdzst: {
    label: '竹石体',
    family: 'YRDZST',
    sources: [
      'https://wordart202608-1379320306.cos.accelerate.myqcloud.com/YangRenDongZhuShiTi-Regular-2.ttf',
      'fonts/YangRenDongZhuShiTi-Regular.ttf',
    ],
  },
  muyao: {
    label: '沐瑶',
    family: 'MuYao',
    sources: [
      'https://wordart202608-1379320306.cos.accelerate.myqcloud.com/YaoSuiXinShouXieTi-2.ttf',
      'fonts/MuYaoShouXieTi-Regular.ttf',
    ],
  },
}

/** 已成功加载并入册 document.fonts 的字体 key */
const loaded = new Set()
/** 进行中的加载 Promise,避免并发重复请求同一个字体 */
const loading = {}

/**
 * 依次尝试候选源加载指定字体,任一成功即入册 document.fonts。
 * @param {string} key FONT_DEFS 的键(system 直接返回 false,无需加载)
 * @returns {Promise<boolean>}
 */
export function ensureFont(key) {
  const def = FONT_DEFS[key]
  if (!def || !def.sources.length) return Promise.resolve(false)
  if (loaded.has(key)) return Promise.resolve(true)
  if (loading[key]) return loading[key]
  loading[key] = (async () => {
    for (const src of def.sources) {
      try {
        const face = new FontFace(def.family, `url(${src})`)
        await face.load()
        document.fonts.add(face)
        await document.fonts.load(`16px "${def.family}"`)
        loaded.add(key)
        return true
      } catch {
        // 该源失败(COS CORS 未配 / 404 / 弱网),继续尝试下一源
      }
    }
    return false
  })()
  return loading[key]
}

/**
 * 应用指定字体到渲染引擎并落盘偏好。
 * system = 系统黑体;手写字体把其家族排到字体栈首,未收录字符回退系统字体。
 */
export function applyFont(key) {
  const def = FONT_DEFS[key] || FONT_DEFS.system
  const stack = def.family ? `"${def.family}", ${CJK_FONT_STACK}` : CJK_FONT_STACK
  setCJKFontStack(stack)
  try {
    localStorage.setItem('wordart-font', def.family ? key : 'system')
  } catch {
    /* 隐私模式静默降级 */
  }
}

/** 读取上次选择的字体 key;无记录或记录失效时回退 system */
export function storedFontKey() {
  try {
    const k = localStorage.getItem('wordart-font')
    return FONT_DEFS[k] && FONT_DEFS[k].sources.length ? k : 'system'
  } catch {
    return 'system'
  }
}
