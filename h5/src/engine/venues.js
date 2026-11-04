/**
 * 场地档案（演示种子）—— 云南 7 个预设场地。
 *
 * 场地的物理条件决定「这个场地最多能飞多少架」，不是价格问题而是能不能接单：
 *   净空中心半径 500 m 内无高压线 / 高楼 / 树木（团体标准）；边缘水平距离 ≥ 飞行高度 1.5 倍（团体标准）；
 *   起降面积 ≥ 集群展开面积 2 倍（团体标准）；画面垂直投射地面边界外延 30 m 保持无人清空（武汉规范第十四条）。
 * 圈层防护（武汉规范第十五条）：核心区 → 10 m 隔离区（≥2 m 不透视硬质隔离、保安 ≥10 m/人）
 *   → 20 m 缓冲区（≥1.5 m 硬质隔离、保安 ≥5 m/人）→ 缓冲区外软质隔离（保安 ≥3 m/人）。
 *
 * 容量粒度到 场地 × 日 × 时段（slotCapacity），不是「每日余量」。
 * officialEvalDone = 初次活动前由公安机关会同空管、气象、无线电管理等部门做的可行性评估（武汉规范第十八条），二次活动不重做。
 * usesSpecificFrequency = 使用国家无线电管理机构确定的特定频率且取得型号核准的，无需频率许可和电台执照（条例第十五条）。
 *
 * 地图选点 / 手动输入没有实测数据（2026-10-28 起 H5 不再开放该入口：只开放固定预设场地）。
 */

import { CITIES } from './policy.js'

// 编队间距（决定展开面积）：规模越大间距越密
export const SPACING = { 100: 4.0, 200: 3.5, 300: 3.0, 500: 2.8, 1000: 2.5 }

export function spacingOf(drones) {
  const keys = Object.keys(SPACING).map(Number).sort((a, b) => a - b)
  let s = SPACING[keys[keys.length - 1]]
  for (const k of keys) { if (drones <= k) { s = SPACING[k]; break } }
  return s
}

/**
 * 这个场地装不装得下这个规模 —— 用在第 2 步的档位过滤，不是「选完再判 FAIL」。
 * 判据：起降面积 ≥ 2 × 集群展开面积（团体标准），且不超过场地档案的 maxDronesCap。
 * 效力层级要分清：500 m 净空 / 1.5 倍 / 2 倍面积来自团体标准（T/CUA 2022），不是行政法规；
 * 武汉规范第十四条只要求「面积满足相应集群数量规模要求 + 画面垂直投射边界外延 30 m 无人清空」。
 * 还有一层是动态的：CCAR-92 第92.517条 容量按「空域或起降场在特定时间内最多能接受的数量」评估，
 * 第92.533条 流量管理可在飞行前把已提交的架数改小 —— 这里是静态物理上限，日期时段步还要按当日容量再核对。
 * 未实测场地返回 null：给不出可承诺的上限，只能「预判定 · 待实地勘察」。
 */
export function fitsTier(venue, drones) {
  if (venue.virtual) return null
  const need = Math.round(drones * spacingOf(drones) ** 2)
  return venue.launchAreaM2 >= need * 2 && drones <= (venue.maxDronesCap || 1000)
}

/** 该场地的物理上限（按最密间距反推），用于第 1 步的场地档案 */
export function venueCap(venue) {
  if (venue.virtual) return null
  return Math.min(venue.maxDronesCap || 1000, Math.floor(venue.launchAreaM2 / (2 * spacingOf(1000) ** 2)))
}

export function maxDronesOf(venue, drones = 1000) {
  // 起降面积 ≥ 2 × 集群展开面积，展开面积 ≈ 架数 × 间距²
  const byArea = Math.floor(venue.launchAreaM2 / (2 * spacingOf(drones) ** 2))
  return Math.min(venue.maxDronesCap || 1000, byArea)
}

export const VENUES = [
  {
    id: 'V01', city: 'KM', name: '滇池国际会展中心广场', address: '昆明市 · 滇池路 148 号',
    lng: 102.6851, lat: 24.9612, airspace: 'controlled', heightM: 150,
    clearRadiusM: 520, edgeRatio: 1.6, launchAreaM2: 9200, projectionMarginM: 34,
    circleOk: true, permit: 'GRANTED', crowd: 1500, power: '市电（380V/60A）',
    distanceToCityKm: 6, dailyCapacity: 2, slotCapacity: 1, maxDronesCap: 1000,
    officialEvalDone: true, usesSpecificFrequency: true, emcComplex: false,
    note: '机场净空外围，属管制空域；管理方已出具同意证明；初次活动前已由公安机关会同空管、气象、无线电管理等部门完成可行性评估'
  },
  {
    id: 'V02', city: 'KM', name: '海埂大坝观景平台', address: '昆明市 · 滇池路海埂大坝',
    lng: 102.6612, lat: 24.9405, airspace: 'fit', heightM: 110,
    clearRadiusM: 600, edgeRatio: 1.8, launchAreaM2: 6400, projectionMarginM: 30,
    circleOk: true, permit: 'GRANTED', crowd: 800, power: '市电（380V/40A）',
    distanceToCityKm: 12, dailyCapacity: 2, slotCapacity: 1, maxDronesCap: 400,
    officialEvalDone: true, usesSpecificFrequency: true, emcComplex: false,
    note: '落入昆明市适飞空域（昆政发〔2026〕10 号，2026-06-15 生效；原昆政发〔2026〕1 号已同步停用）'
  },
  {
    id: 'V03', city: 'DL', name: '洱海生态公园东岸草坪', address: '大理市 · 洱海生态廊道才村段',
    lng: 100.1935, lat: 25.7042, airspace: 'fit', heightM: 120,
    clearRadiusM: 480, edgeRatio: 1.4, launchAreaM2: 7800, projectionMarginM: 30,
    circleOk: false, permit: 'PENDING', crowd: 1200, power: '发电机（需自备）',
    distanceToCityKm: 18, dailyCapacity: 1, slotCapacity: 1, maxDronesCap: 500,
    officialEvalDone: false, usesSpecificFrequency: true, emcComplex: true,
    note: '净空中心半径不足 500 m（东侧有 10 kV 线路，属强电磁干扰源）；圈层防护缓冲区未达 20 m；初次活动前可行性评估未做'
  },
  {
    id: 'V04', city: 'LJ', name: '丽江古城四方街', address: '丽江市 · 古城区四方街',
    lng: 100.2345, lat: 26.8712, airspace: 'controlled', heightM: 90,
    clearRadiusM: 260, edgeRatio: 1.1, launchAreaM2: 2600, projectionMarginM: 22,
    circleOk: false, permit: 'NONE', crowd: 3000, power: '市电（220V/30A）',
    distanceToCityKm: 1, dailyCapacity: 1, slotCapacity: 1, maxDronesCap: 150,
    officialEvalDone: false, usesSpecificFrequency: false, emcComplex: false,
    note: '四周建筑包围、净空半径严重不足；观众密度高，触发「飞越集会人群上空」例外；未使用国家确定的特定频率，需无线电频率使用许可和电台执照'
  },
  {
    id: 'V05', city: 'BS', name: '施甸县城中心广场', address: '保山市 · 施甸县姚关镇',
    lng: 99.3912, lat: 24.7215, airspace: 'fit', heightM: 120,
    clearRadiusM: 560, edgeRatio: 1.7, launchAreaM2: 5200, projectionMarginM: 30,
    circleOk: true, permit: 'GRANTED', crowd: 600, power: '市电（380V/40A）',
    distanceToCityKm: 45, dailyCapacity: 1, slotCapacity: 1, maxDronesCap: 300,
    border: true, borderDistanceKm: 38, officialEvalDone: false, usesSpecificFrequency: true, emcComplex: false,
    note: '边境地区：需取得有权的空中交通管理机构批准（云南草案第二十五条）；国界线我方一侧 25000 m 内航测航摄需省人民政府同意。适用保山市 2025-12-25 公布的适飞空域'
  },
  {
    id: 'V06', city: 'BN', name: '告庄西双景大金塔广场', address: '景洪市 · 告庄西双景',
    lng: 100.8012, lat: 22.0135, airspace: 'controlled', heightM: 130,
    clearRadiusM: 510, edgeRatio: 1.5, launchAreaM2: 6800, projectionMarginM: 32,
    circleOk: true, permit: 'GRANTED', crowd: 2200, power: '市电（380V/60A）',
    distanceToCityKm: 4, dailyCapacity: 2, slotCapacity: 1, maxDronesCap: 600,
    border: true, borderDistanceKm: 62, officialEvalDone: true, usesSpecificFrequency: true, emcComplex: false,
    note: '边境地区 + 机场净空外围；夜间灯光条件好（夜间或低能见度须开启灯光系统并保持良好状态，条例第三十二条第七项）'
  },
  {
    id: 'V07', city: 'LC', name: '临翔区市民广场', address: '临沧市 · 临翔区文华路',
    lng: 100.0856, lat: 23.8895, airspace: 'fit', heightM: 115,
    clearRadiusM: 540, edgeRatio: 1.6, launchAreaM2: 4600, projectionMarginM: 30,
    circleOk: true, permit: 'GRANTED', crowd: 500, power: '市电（380V/40A）',
    distanceToCityKm: 3, dailyCapacity: 1, slotCapacity: 1, maxDronesCap: 250,
    border: true, borderDistanceKm: 75, officialEvalDone: true, usesSpecificFrequency: true, emcComplex: false,
    note: '边境地区需取得有权空管机构批准；场地实测数据完整，可承接 250 架以内'
  }
]

export function venueOf(id) { return VENUES.find(v => v.id === id) || null }

/** 没有实测数据，只能给「预判定 + 待实地勘察」。保留给管理端与未来接入，H5 已不开放自选场地入口 */
export function virtualVenue({ city, name, address, lng, lat }) {
  const seed = Math.abs(Math.round((lng * 10000 + lat * 10000)) % 100)
  const c = CITIES.find(x => x.code === city) || CITIES[0]
  return {
    id: 'V' + seed, city, name, address, lng, lat,
    airspace: seed < Math.round((c.fitRatioEstimate || 0.4) * 100) ? 'fit' : 'controlled',
    heightM: 120,
    clearRadiusM: 0, edgeRatio: 0, launchAreaM2: 0, projectionMarginM: 0,
    circleOk: false, permit: 'NONE', crowd: 0, power: '未确认',
    distanceToCityKm: 0, dailyCapacity: 1, slotCapacity: 1, maxDronesCap: 1000,
    officialEvalDone: false, usesSpecificFrequency: true, emcComplex: false,
    virtual: true, border: c.border, cityAirport: c.airport,
    note: '未实测：需实地勘察（约 1 个工作日）确认净空、面积、圈层防护与场地许可；判定费按实际难度计（见 judgeFee.js）'
  }
}
