// 通用格式化与字典
const pad = (n) => String(n).padStart(2, '0')

/** 金额：¥xx,xxx */
export function fmtMoney(n) {
  return '¥' + (Number(n) || 0).toLocaleString('zh-CN')
}

/** 时间：YYYY-MM-DD HH:mm */
export function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 今天 YYYY-MM-DD（本地） */
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 订单状态字典（颜色规范：待支付橙/待接单红/已接单蓝/执行中紫/已完成绿/已评价青/已取消灰/退款中橙红/已退款深灰） */
export const STATUS_MAP = {
  PENDING_PAY: { text: '待支付', type: 'warning' },
  PENDING_ACCEPT: { text: '待接单', type: 'danger' },
  ACCEPTED: { text: '已接单·待执行', type: 'primary' },
  IN_SERVICE: { text: '执行中', color: '#8B5CF6' },
  COMPLETED: { text: '已完成', type: 'success' },
  REVIEWED: { text: '已评价', color: '#13C2C2' },
  CANCELLED: { text: '已取消', type: 'info' },
  REFUNDING: { text: '退款中', color: '#F2503F' },
  REFUNDED: { text: '已退款', color: '#4B5563' }
}

export const REFUND_STATUS_MAP = {
  PENDING: { text: '待审批', type: 'warning' },
  APPROVED: { text: '已通过', type: 'success' },
  REJECTED: { text: '已拒绝', type: 'danger' }
}

export const ADDON_LABELS = {
  music: '专属音乐编曲',
  narration: '现场旁白解说',
  aerial: '双机位航拍记录',
  urgent: '加急服务（48h 内安排）'
}

export const PATTERN_LABELS = {
  heart: '爱心',
  ring: '钻戒',
  star: '星辰',
  phoenix: '凤凰',
  rose: '玫瑰',
  moon: '月亮船'
}

export const VENUE_TYPE_LABELS = {
  preset: '预设场地',
  map: '地图选点',
  manual: '手动输入'
}

export const PAY_CHANNEL_LABELS = {
  WECHAT: '微信支付',
  ALIPAY: '支付宝'
}

/** 方案摘要：300架·15分钟·定制文字 */
export function orderSummary(o) {
  if (!o) return ''
  let content = '预设图案'
  if (o.customText && o.customLogo) content = '文字+LOGO定制'
  else if (o.customText) content = '定制文字'
  else if (o.customLogo) content = 'LOGO定制'
  return `${o.droneCount}架·${o.duration}分钟·${content}`
}

/** 附加服务文案 */
export function addonsText(addons) {
  if (!addons || !addons.length) return '无'
  return addons.map((k) => ADDON_LABELS[k] || k).join('、')
}

/** 预设图案文案 */
export function patternsText(patterns) {
  if (!patterns || !patterns.length) return '无'
  return patterns.map((k) => PATTERN_LABELS[k] || k).join('、')
}
