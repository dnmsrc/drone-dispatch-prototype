/**
 * 云南政策数据层（演示种子 · 将来由后端「政策库 + 字典」驱动）
 *
 * 三条必须说清的事实（2026-10-19 逐条核对，原文见 docs/regulations/）：
 * 1. 适飞空域由「设区的市级以上人民政府」逐市公布 —— 逐市维护、有文号与生效日期，会更新替换（昆政发〔2026〕1 号 → 〔2026〕10 号，原版同步停用），不能写死。
 * 2. 临时管制空域由公安、卫生健康、应急管理等职能部门提出、经空管同意、生效前由市级以上政府「发布公告」；
 *    实践中县级公安还会单独发「活动管控通告」（平定县 2026-10-13 发，演出 10-15 日 20:30，管控时段 19:30-21:30）——
 *    这类公告在演出前 2 天才出现，只能作为黑名单时段维护，不能预先编码成固定档期。
 * 3. 省级《云南省民用无人驾驶航空器公共安全管理办法》是**草案，尚未施行**（施行日期为占位符）；
 *    已生效的是各市政府公布的适飞空域通告。演示时两者不能混用。
 *
 * 关键结论：编队表演不存在免审批。免申请情形的例外包含「实施分布式操作或者集群飞行」
 * 与「飞越集会人群上空」，且表演真高通常超过适飞空域 120 m 上限（行业实操通常不超过 150 m）。
 */

export const PROVINCE = {
  name: '云南省',
  law: {
    title: '云南省民用无人驾驶航空器公共安全管理办法',
    status: '草案 · 5 章 33 条 · 2026-06-10 立法听证 · 2026-07-30 司法厅再次征求意见（截止 2026-08-30）· 尚未施行',
    source: 'http://sft.yn.gov.cn/tzgg/406698.jhtml',
    articles: {
      '4': '省人民政府建立跨部门协同管理机制；探索特定区域便捷飞行等服务',
      '6': '民用机场所在地的县（市、区）政府会同空管、民航、公安及机场运营人，在民用机场净空保护区域开展扰航防范工作',
      '9': '发展改革部门协助空中交通管理机构建立飞行计划联合审批机制，推行线上一站式办理；低空智能网联系统与 UOM 联通，归集厂家、唯一识别码、实名登记、飞行活动等基础信息',
      '12': '交通运输部门依法向空中交通管理机构提出管制空域划设、调整建议',
      '13': '公安机关可以对实名登记等情况进行核验，人民警察核验时应当表明身份',
      '17': '管制空域依法由设区的市级以上政府公布；临时管制空域由公安、卫生健康、应急管理等职能部门提出，经空管同意，生效前由市级以上政府发布公告；公布范围内的单位可向公众提示',
      '19': '依法需要取得相关资质的，按国家规定执行',
      '20': '所有者应完成实名登记和设备激活，未经实名登记和激活不得使用；转卖、赠送、报废、损毁、丢失或性能参数改变的，应办理登记变更、注销和设备取消激活',
      '21': '拟飞行前 1 日 12 时前提交申请，明确飞行时间、区域、高度、机型、用途、操控人员、相关资质；应在批准事项范围内开展，计划起飞 1 小时前经确认后方可起飞；未经批准并确认不得飞行',
      '22': '分类管理。免申请情形仅三项；例外七项仍须申请，含「飞越集会人群上空」「实施分布式操作或者集群飞行」',
      '23': '全程主动发送设备识别码、位置、高度、速度、飞行状态，接受空中交通管理和地面安全管控',
      '24': '经营性飞行活动及使用小型、中型、大型无人机从事非经营性飞行活动，应当依法投保责任保险',
      '25': '边境地区管制空域需取得有权的空中交通管理机构批准；国界线我方一侧 25000 m 内航测航摄需省人民政府同意；严禁穿越国境',
      '27': '操控培训机构应取得资质、按大纲培训、建立培训档案',
      '28': '租赁业务须核实承租人资质与身份信息并建立台账；身份不明或拒绝查验的不得提供租赁服务'
    }
  },
  national: {
    title: '《无人驾驶航空器飞行管理暂行条例》（国令第761号，2024-01-01 施行）',
    source: 'https://www.caac.gov.cn/XXGK/XXGK/FLFG/202401/t20240115_222642.html',
    articles: {
      '11': '从事飞行活动的单位须取得运营合格证（含营利法人要求）',
      '12': '经营性飞行活动应当依法投保责任保险',
      '15': '使用国家确定的特定频率且取得型号核准的，无需无线电频率使用许可和电台执照',
      '16': '操控小型、中型、大型无人机须取得操控员执照',
      '19': '八类区域上方空域应划设为管制空域；具体范围由空管机构确定、由设区的市级以上政府公布；范围外为适飞空域',
      '20': '临时增加管制空域由空管确定范围与使用时间；大型活动生效 24 小时前由市级以上政府发布公告，紧急任务 30 分钟前发布紧急公告',
      '23': '国家建设无人驾驶航空器一体化综合监管服务平台（UOM）',
      '26': '拟飞行前 1 日 12 时前申请，前 1 日 21 时前决定；固定空域常态飞行可长期申请 + 前 1 日 12 时前备案',
      '27': '飞行活动申请应包含 13 项内容（资质、数量与性能、任务性质与飞行方式、起降与备降场地、通信、起止时刻、航线高度速度空域、指挥链路频率与带宽、通信导航监视、应答机代码、应急处置程序等）',
      '28': '审批权限按飞行管制分区 / 飞行管制区 / 跨管制区三级划分',
      '30': '获批后应在计划起飞 1 小时前报告预计起飞时刻和准备情况，经确认后方可起飞',
      '31': '免申请情形四项；存在中继飞行、运载危险品或投放物品、飞越集会人群上空、在移动交通工具上操控、分布式操作或集群飞行五种情形之一的仍须申请',
      '33': '单架飞行避让集群飞行'
    }
  },
  localRule: {
    title: '武汉市公安局无人机集群飞行表演活动安全监管工作规范',
    status: '2026-01-29 印发 · 2026-03-01 施行 · 有效期 2 年（云南无对应文件，此处作为可执行的场地与备案参数来源）',
    source: 'https://www.wuhan.gov.cn/ztzl/24zt/dkjjgzlfz/zcwj/202602/t20260213_2729739.shtml',
    articles: {
      '4': '军队、民航、地方协同备案机制；向公安、民航、无线电、文旅、场地管理等部门备案，向空管申请活动临时空域使用；公安机关组织现场勘查、可行性评估和安全监管；1000 架次及以上由市级公安组织，1000 架次以下由区级公安组织',
      '6': '主、承办单位、场地管理单位和公安机关联合现场勘查',
      '7': '不得擅自由变更经备案的活动内容、地点等关键要素（改期 = 重新备案 + 重新审批）',
      '8': '气象安全标准：避开雨、雪、冰雹、雾霾、雷电；温度 ≥ -5℃、湿度 < 90%、风速 < 8 m/s',
      '9': '电磁环境标准',
      '10': '设备防水防火',
      '11': '通信网络、软件与硬件须与互联网物理隔离',
      '12': '必须购买第三方责任险',
      '13': '活动前须进行小架次边框或彩排测试，含应急情况处置',
      '14': '场地平整空旷、面积满足规模要求；画面垂直投射地面边界外延 30 m 保持无人清空',
      '15': '圈层模式：核心区 → 10 m 隔离区（≥2 m 不透视硬质隔离，保安 ≥10 m/人）→ 20 m 缓冲区（≥1.5 m 硬质隔离，保安 ≥5 m/人）→ 缓冲区外软质隔离（保安 ≥3 m/人）',
      '16': '活动举办前 20 日完成备案，各部门 7 日内核实后报空管审批',
      '17': '备案内容 8 项（含责任险证明、安全承诺书、安全工作方案与应急预案、场地管理部门同意证明）',
      '18': '公安机关会同空管、气象、无线电管理等部门，在初次活动前对场地飞行进行可行性评估',
      '21': '公安机关根据活动当日现场整体态势决定活动进行与否'
    }
  },
  groupStandard: {
    title: '全国团体标准《无人机编队飞行表演技术规范》（2022-01）',
    note: '净空中心半径 500 m、边缘水平距离 ≥ 飞行高度 1.5 倍、起降面积 ≥ 集群展开面积 2 倍来自团体标准，效力层级低于行政法规',
    source: 'https://www.ttbz.org.cn/upload/file/20220110/6377743095052234854885364.pdf'
  }
}

/**
 * 逐市适飞空域：文号 + 公布主体 + 生效日期 + 来源。
 * fitRatioEstimate 是演示估算值 —— 通告只公布图形和真高 120 m 以下，不公布百分比。
 */
export const CITIES = [
  {
    code: 'KM', name: '昆明', authority: '昆明市人民政府',
    version: '昆政发〔2026〕10 号', effective: '2026-06-15',
    prevVersion: '昆政发〔2026〕1 号（2026-02-05 公布，已同步停用）',
    fitRatioEstimate: 0.41, ceilingM: 120, border: false,
    source: 'https://www.km.gov.cn/c/2026-06-17/5090199.shtml',
    airport: { name: '昆明长水国际机场', sideKm: 10, outerKm: 20 },
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [7, 10], largeLeadDays: [10, 15] }
  },
  {
    code: 'BS', name: '保山', authority: '保山市人民政府',
    version: '保山市适飞空域范围通告', effective: '2025-12-25',
    fitRatioEstimate: 0.36, ceilingM: 120, border: true, airport: null,
    source: 'https://www.baoshan.gov.cn/info/1076/10320044.htm',
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [12, 18], largeLeadDays: [15, 20], borderNote: '边境地区管制空域需取得有权的空中交通管理机构批准（草案第二十五条）' }
  },
  {
    code: 'LC', name: '临沧', authority: '临沧市人民政府',
    version: '优化调整后的临沧市适飞空域范围通告', effective: '待核实（已重新公布）',
    fitRatioEstimate: 0.38, ceilingM: 120, border: true, airport: null,
    source: 'https://www.lincang.gov.cn/artview/3/351049.html',
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [12, 18], largeLeadDays: [15, 20], borderNote: '边境地区管制空域需取得有权的空中交通管理机构批准（草案第二十五条）' }
  },
  {
    code: 'QJ', name: '曲靖', authority: '曲靖市人民政府',
    version: '待核实', effective: '待核实', fitRatioEstimate: 0.45, ceilingM: 120, border: false, airport: null,
    source: 'http://www.qj.gov.cn/',
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [7, 10], largeLeadDays: [10, 15] }
  },
  {
    code: 'YX', name: '玉溪', authority: '玉溪市人民政府',
    version: '待核实', effective: '待核实', fitRatioEstimate: 0.43, ceilingM: 120, border: false, airport: null,
    source: 'http://www.yuxi.gov.cn/',
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [7, 10], largeLeadDays: [10, 15] }
  },
  {
    code: 'DL', name: '大理', authority: '大理州人民政府',
    version: '待核实', effective: '待核实', fitRatioEstimate: 0.52, ceilingM: 120, border: false, airport: null,
    source: 'http://www.dali.gov.cn/',
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [7, 10], largeLeadDays: [10, 15] }
  },
  {
    code: 'LJ', name: '丽江', authority: '丽江市人民政府',
    version: '待核实', effective: '待核实', fitRatioEstimate: 0.47, ceilingM: 120, border: false,
    airport: { name: '丽江三义机场', sideKm: 10, outerKm: 20 }, source: 'http://www.lijiang.gov.cn/',
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [7, 10], largeLeadDays: [10, 15] }
  },
  {
    code: 'BN', name: '西双版纳', authority: '西双版纳州人民政府',
    version: '待核实', effective: '待核实', fitRatioEstimate: 0.44, ceilingM: 120, border: true,
    airport: { name: '西双版纳嘎洒机场', sideKm: 10, outerKm: 20 }, source: 'http://www.xsbn.gov.cn/',
    approval: { police: '区级公安', largePolice: '市级公安', largeDrones: 1000, leadDays: [12, 18], largeLeadDays: [15, 20], borderNote: '边境地区管制空域需取得有权的空中交通管理机构批准（草案第二十五条）' }
  }
]

/**
 * 政府公告日历（临时管制空域 / 活动管控通告）—— 演示种子。
 * 真实系统由后台「政策库 / 政府公告」录入，按城市维护。
 * 注意：这类公告是动态产生的（平定县案例：演出前 2 天才发），只能在审批阶段核对。
 * 两类文书要分开：
 *   ban    = 设区的市级以上政府发布的临时管制空域公告（条例第二十条）
 *   notice = 县级公安发布的活动管控通告（禁止他人放飞，覆盖演出前后各 1 小时）
 */
export const ANNOUNCEMENTS = [
  { offset: 6, city: 'KM', kind: 'ban', type: '临时管制', reason: '市级大型活动安保，画面投射空域被临时占用', scope: '滇池周边真高 120 m 以下', source: '昆明市人民政府公告' },
  { offset: 13, city: 'DL', kind: 'ban', type: '临时管制', reason: '洱海生态廊道大型群众性活动', scope: '才村码头一带', source: '大理州人民政府公告' },
  { offset: 21, city: 'LC', kind: 'ban', type: '边境管控', reason: '边境管理区联合管控时段', scope: '临翔区城区', source: '空中交通管理机构（边境地区有权空管）' },
  { offset: 34, city: 'BN', kind: 'ban', type: '临时管制', reason: '泼水节前置彩排与安保空域', scope: '告庄西双景', source: '西双版纳州人民政府公告' },
  { offset: 3, city: 'KM', kind: 'notice', type: '活动管控通告', reason: '他人活动已获批，管控时段覆盖演出前后各 1 小时', scope: '广场及停车场', window: ['19:30', '21:30'], source: '县级公安（参照平定县 2026-10-13 通告形态）' }
]

export function cityOf(code) {
  return CITIES.find(c => c.code === code) || CITIES[0]
}

export function announcementsOf(code, from, to) {
  const base = new Date()
  return ANNOUNCEMENTS
    .filter(a => a.city === code)
    .map(a => ({ ...a, date: addDays(base, a.offset) }))
    .filter(a => a.date >= from && a.date <= to)
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return fmtDate(x)
}

export function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
