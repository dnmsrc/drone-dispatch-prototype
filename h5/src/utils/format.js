// 展示格式化工具
export function fen2yuan(v) {
  // 后端金额单位为元，这里仅做千分位
  return '¥' + Number(v || 0).toLocaleString('zh-CN')
}

export function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const STATUS = {
  PENDING_PAY: { text: '待支付', color: '#E6A23C', bg: 'rgba(230,162,60,.12)' },
  PENDING_ACCEPT: { text: '待接单', color: '#F56C6C', bg: 'rgba(245,108,108,.12)' },
  ACCEPTED: { text: '已接单·待执行', color: '#4A6CF7', bg: 'rgba(74,108,247,.12)' },
  IN_SERVICE: { text: '执行中', color: '#8E6BF0', bg: 'rgba(142,107,240,.12)' },
  COMPLETED: { text: '已完成', color: '#2BA471', bg: 'rgba(43,164,113,.12)' },
  REVIEWED: { text: '已评价', color: '#3DB8A0', bg: 'rgba(61,224,192,.14)' },
  CANCELLED: { text: '已取消', color: '#909399', bg: 'rgba(144,147,153,.12)' },
  REFUNDING: { text: '退款中', color: '#FF7849', bg: 'rgba(255,120,73,.12)' },
  REFUNDED: { text: '已退款', color: '#606266', bg: 'rgba(96,98,102,.12)' }
}

export function statusOf(code) {
  return STATUS[code] || { text: code, color: '#909399', bg: 'rgba(144,147,153,.12)' }
}

// 附加服务/图案 key -> 中文名（兜底用，优先使用接口返回）
export const ADDON_NAMES = {
  music: '专属音乐编曲', narration: '现场旁白解说', aerial: '双机位航拍记录', urgent: '加急服务（48h 内安排）'
}
export const PATTERN_NAMES = {
  heart: '爱心', ring: '钻戒', star: '星辰', phoenix: '凤凰', rose: '玫瑰', moon: '月亮船'
}

// 订单方案摘要
export function orderSummary(o) {
  const parts = [`${o.droneCount} 架`, `${o.duration} 分钟`]
  if (o.customText) parts.push(`「${o.customText}」`)
  if (o.customLogo) parts.push('LOGO 定制')
  if (o.addons && o.addons.length) parts.push(`${o.addons.length} 项增值服务`)
  return parts.join(' · ')
}
