/**
 * 导出:PNG / 单页 A4 PDF(jsPDF)/ 纯文本 TXT。
 * 全部在浏览器本地完成,无任何上传。
 *
 * jsPDF 体积大(主 chunk 因它膨胀到 ~370KB),而 PNG/TXT 导出根本用不到——
 * 改为点击「导出 PDF」时才动态 import,首屏 JS 因此小一个量级(弱网提速关键)。
 */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function exportCanvasPNG(canvas, filename) {
  canvas.toBlob((b) => {
    if (b) downloadBlob(b, filename)
  }, 'image/png')
}

/** 画布 → 单页 A4 PDF:自动横竖版、居中、12mm 页边距,打印即成品。 */
export async function exportCanvasPDF(canvas, filename) {
  const { jsPDF } = await import('jspdf') // 懒加载:仅首次导出 PDF 时拉取该 chunk
  const landscape = canvas.width > canvas.height
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  const pw = pdf.internal.pageSize.getWidth()
  const ph = pdf.internal.pageSize.getHeight()
  const margin = 12
  const k = Math.min((pw - margin * 2) / canvas.width, (ph - margin * 2) / canvas.height)
  const w = canvas.width * k
  const h = canvas.height * k
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, (ph - h) / 2, w, h)
  pdf.save(filename)
}

export function downloadText(text, filename) {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename)
}
