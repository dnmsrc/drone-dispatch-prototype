/**
 * 可飞性判定单（询价单）—— 订单前置对象。
 *
 * 用户选地点时系统给的是「预判定」，不是结论：
 *   实测场地（预设场地）有净空/面积/圈层数据，可直接判定；
 *   地图选点与手动输入没有实测数据，只能给「预判定通过 · 待实地勘察」。
 * 判定与审批是两个不同环节：判定解决「这个场地物理上能不能飞」，审批解决「这块空域这段时间给不给你」。
 *
 * 两条必须分开的官方环节：
 *   备案 —— 向公安、民航、无线电、文旅、场地管理等部门备案，各部门 7 日内核实（武汉规范第四条、第十六条）；
 *   审批 —— 向空中交通管理机构申请活动临时空域使用，前 1 日 12 时前提出、前 1 日 21 时前决定（条例第二十六条）。
 * 现场勘查是四方联合（主、承办单位、场地管理单位和公安机关，武汉规范第六条）；
 * 可行性评估由公安机关会同空管、气象、无线电管理等部门在**初次活动前**做一次（武汉规范第十八条），同一场地二次活动不重做。
 *
 * 判定不通过不阻断交易：转人工咨询，由客服创建派单（见 consult.js）。
 */
import { CITIES, PROVINCE } from './policy.js'
import { spacingOf } from './venues.js'
import { judgeFee } from './judgeFee.js'
import { needsConsult } from './consult.js'

const R = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', PENDING: 'PENDING' }

export function judge({ venue, drones, date, audience }) {
  const city = CITIES.find(c => c.code === venue.city) || CITIES[0]
  const checks = []
  const push = (key, label, result, detail, basis) => checks.push({ key, label, result, detail, basis })

  // 1 空域属性（逐市公布，按文号与生效日期判定）
  push('airspace', '空域属性', venue.airspace === 'fit' ? R.PASS : R.WARN,
    venue.airspace === 'fit'
      ? `落入${city.name}公布的适飞空域（图形区域真高 ${city.ceilingM} m 以下）`
      : `不在${city.name}公布的适飞空域范围内，按管制空域申请`,
    `${city.authority} · ${city.version}（${city.effective} 生效）`)

  // 2 真高
  push('ceiling', '表演真高', venue.heightM > city.ceilingM ? R.WARN : R.PASS,
    venue.heightM > city.ceilingM
      ? `表演真高 ${venue.heightM} m 超过适飞空域 ${city.ceilingM} m 上限，须按管制空域报批（行业实操通常不超过 150 m）`
      : `表演真高 ${venue.heightM} m，在适飞空域真高上限内`,
    `${city.version}`)

  // 3 集群飞行 —— 编队表演不存在免审批
  push('cluster', '集群飞行', R.WARN,
    `编队表演（投入 ${drones} 架，同一时间并行操控）属免申请情形的例外「实施分布式操作或者集群飞行」，必须申请`,
    `《条例》第三十一条 / 云南草案第二十二条`)

  // 4 集会人群
  const crowd = audience || venue.crowd || 0
  push('crowd', '飞越集会人群', crowd >= 1000 ? R.WARN : R.PASS,
    crowd >= 1000
      ? `预计观众 ${crowd} 人，画面垂直投射在人群上方，触发「飞越集会人群上空」例外，须申请；1000 人以上需大型群众性活动安全许可证（1000-5000 人由县级公安机关许可，5000 人以上由设区的市级公安机关许可，承办者应在活动日 20 日前申请）`
      : `预计观众 ${crowd} 人，未达大型群众性活动门槛`,
    `《条例》第三十一条例外 / 大型群众性活动安全管理条例第六条、第十三条`)

  // 5 边境地区
  if (venue.border) {
    push('border', '边境地区', R.WARN,
      `距国（边）境约 ${venue.borderDistanceKm || '—'} km：边境地区管制空域需取得有权的空中交通管理机构批准；国界线我方一侧 25000 m 范围内航测、航摄需省人民政府同意并按规定上报批准；严禁穿越国境`,
      '云南草案第二十五条')
  }

  // 6 机场净空保护区域
  if (city.airport) {
    push('airport', '机场净空', venue.airportZone ? R.WARN : R.PASS,
      venue.airportZone
        ? `位于${city.airport.name}净空保护区域外围（跑道两侧各 ${city.airport.sideKm} km、端外 ${city.airport.outerKm} km）`
        : `不在${city.airport.name}净空保护区域内`,
      '云南草案第六条')
  }

  // 7-11 场地物理条件（决定「最多能飞多少架」）
  if (venue.virtual) {
    push('clearance', '净空中心半径', R.PENDING, '未实测：需实地勘察确认 500 m 内有无高压线、高楼、树木（团体标准，非行政法规）', '团体标准《无人机编队飞行表演技术规范》')
    push('edge', '边缘水平距离', R.PENDING, '未实测：需实地勘察确认 ≥ 飞行高度 1.5 倍（团体标准，非行政法规）', '团体标准《无人机编队飞行表演技术规范》')
    push('area', '起降面积', R.PENDING, `未实测：需 ≥ 集群展开面积（约 ${Math.round(drones * spacingOf(drones) ** 2)} m²）的 2 倍（团体标准）；武汉规范第十四条只要求面积满足规模要求`, '团体标准 / 武汉规范第十四条')
    push('projection', '画面投射外延', R.PENDING, '未实测：画面垂直投射地面边界外延 30 m 需保持无人清空', '武汉规范第十四条')
    push('circle', '圈层防护', R.PENDING, '未实测：核心区 → 10 m 隔离区（≥2 m 不透视硬质、保安 ≥10 m/人）→ 20 m 缓冲区（≥1.5 m 硬质、保安 ≥5 m/人）→ 缓冲区外软质（保安 ≥3 m/人）', '武汉规范第十五条')
  } else {
    push('clearance', '净空中心半径', venue.clearRadiusM >= 500 ? R.PASS : R.FAIL,
      `实测 ${venue.clearRadiusM} m（要求 ≥ 500 m 内无高压线/高楼/树木）`, '团体标准（非行政法规）')
    push('edge', '边缘水平距离', venue.edgeRatio >= 1.5 ? R.PASS : R.FAIL,
      `实测 ${venue.edgeRatio} 倍飞行高度（要求 ≥ 1.5 倍）`, '团体标准（非行政法规）')
    const need = Math.round(drones * spacingOf(drones) ** 2)
    push('area', '起降面积', venue.launchAreaM2 >= need * 2 ? R.PASS : R.FAIL,
      `实测 ${venue.launchAreaM2} m²，本单需 ${need} m² 展开面积（要求 ≥ 2 倍即 ${need * 2} m²）`, '团体标准（非行政法规）')
    push('projection', '画面投射外延', venue.projectionMarginM >= 30 ? R.PASS : R.FAIL,
      `实测 ${venue.projectionMarginM} m（要求 ≥ 30 m 无人清空）`, '武汉规范第十四条')
    push('circle', '圈层防护', venue.circleOk ? R.PASS : R.WARN,
      venue.circleOk ? '已按圈层防护规范布置（隔离区 ≥2 m 硬质、保安 ≥10 m/人；缓冲区 ≥1.5 m 硬质、保安 ≥5 m/人）' : '需补建隔离区/缓冲区（硬质隔离与保安密度）', '武汉规范第十五条')
  }

  // 12 场地许可 + 联合现场勘查
  push('permit', '场地许可', venue.permit === 'GRANTED' ? R.PASS : venue.permit === 'PENDING' ? R.WARN : R.FAIL,
    venue.permit === 'GRANTED' ? '已取得场地管理方同意证明（备案内容第七项）'
      : venue.permit === 'PENDING' ? '同意证明办理中'
      : '未取得场地管理方同意证明，需甲方协调或改场地', '武汉规范第十七条（七）')
  push('surveyJoint', '联合现场勘查', R.WARN, '主、承办单位、活动场地管理单位和公安机关四方联合现场勘查，发现隐患由相应责任单位整改', '武汉规范第六条')

  // 13 官方可行性评估（初次活动前，由公安机关会同空管、气象、无线电管理等部门）
  push('officialEval', '官方可行性评估', venue.officialEvalDone ? R.PASS : R.WARN,
    venue.officialEvalDone ? '该场地已完成初次活动前的可行性评估（二次活动不重做）'
      : '初次活动前须由公安机关会同空中交通管理部门和气象、无线电管理等部门对场地飞行进行可行性评估',
    '武汉规范第十八条')

  // 14 责任保险（强制项）
  push('insurance', '责任保险', R.WARN, '经营性飞行必须投保责任保险（强制项，计入报价，不可选），行业实操要求保额不低于 100 万元', '条例第十二条 / 云南草案第二十四条 / 武汉规范第十二条')

  // 15 资质与实名登记激活
  push('qualification', '承飞方资质', R.PASS,
    '运营合格证（条例第十一条，经营性活动须为营利法人）+ 操控员执照（条例第十六条）+ 实名登记与设备激活（云南草案第二十条，未经实名登记和激活不得使用）',
    '条例第十一条、第十六条 / 云南草案第二十条')
  push('identity', '身份与资质查验', R.WARN,
    '自然人查验身份证件；企业法人查验营业执照、授权委托书、经办人身份证件。电子签名需第三方认证时，认证机构应当查验申请人身份（电子签名法第二十条）。注意：云南草案第二十七条是培训机构培训档案，第二十八条的台账要求针对租赁业务的承租人，不能引用为表演服务的查验依据',
    '条例第十一条、第十六条 / 云南草案第十九条、第二十条 / 电子签名法第二十条')
  push('radio', '无线电频率', venue.usesSpecificFrequency ? R.PASS : R.WARN,
    venue.usesSpecificFrequency
      ? '使用国家无线电管理机构确定的特定频率且取得型号核准的，无需无线电频率使用许可和电台执照'
      : '未使用特定频率或未获型号核准，需无线电频率使用许可和电台执照',
    '条例第十五条 / 云南草案第十四条')
  push('network', '网络物理隔离', R.WARN, '通信网络、软件系统和硬件设备均不得同互联网链接，保持物理隔离状态', '武汉规范第十一条')
  push('emc', '电磁环境', venue.emcComplex ? R.FAIL : R.PASS,
    venue.emcComplex ? '场地及周边存在强电磁场干扰源（大功率雷达、大功率电台、信号发射塔、高压线、变电站、大型发电供电设备、大型钢架结构）' : '无强电磁场干扰源', '武汉规范第九条')
  push('device', '设备防水防火', R.WARN, '飞行器、电池、地面站、电台、交换机等所有设备须做防水防火处理并配备防火器材', '武汉规范第十条')

  // 16 实地勘察（我方）
  if (venue.virtual) push('survey', '实地勘察', R.PENDING, '预判定通过，结论以实地勘察为准（约 1 个工作日）', '业务流程 / 一飞智控流程第二步：场地勘测 1 天')

  const hasFail = checks.some(c => c.result === R.FAIL)
  const hasPending = checks.some(c => c.result === R.PENDING)
  const conclusion = hasFail ? 'BLOCKED' : hasPending ? 'SURVEY' : 'APPROVAL'

  // 可承接架数上限（由场地面积与净空决定）；未实测的场地给不出上限
  let maxDrones = venue.virtual ? null : (venue.maxDronesCap || 1000)
  if (!venue.virtual) {
    const byArea = Math.floor(venue.launchAreaM2 / (2 * spacingOf(drones) ** 2))
    maxDrones = Math.min(maxDrones, byArea)
  }

  const ap = city.approval
  const large = drones >= ap.largeDrones || venue.airspace === 'controlled'
  const leadDays = large ? ap.largeLeadDays[1] : ap.leadDays[1]
  const level = large ? ap.largePolice : ap.police

  const fee = judgeFee({ venue, drones })
  const reasons = needsConsult({ conclusion, city, venue, maxDrones, officialEvalDone: venue.officialEvalDone }, { droneCount: drones, audience: crowd })

  return {
    city, venue, checks, conclusion, maxDrones, fee, consultReasons: reasons,
    conclusionText: {
      BLOCKED: '不可飞 · 场地物理条件不达标',
      SURVEY: '预判定通过 · 待实地勘察',
      APPROVAL: '可飞 · 需报批（编队表演无免审批路径）'
    }[conclusion],
    nextAction: reasons.length ? '转人工咨询 · 由客服创建派单' : '可自助进入报价区间',
    approval: {
      level, leadDays,
      airspaceLevel: '向空中交通管理机构申请活动临时空域使用：飞行管制分区内由负责该分区的机构批准；跨飞行管制区由上级机构批准（条例第二十八条）。区级/市级公安是备案与现场安全监管分工，不是审批层级',
      window: ap.leadDays,
      filingDays: 20, verifyDays: 7,
      borderNote: ap.borderNote || '',
      items: [
        '民用无人机飞行活动经营资质证书（运营合格证）',
        '工商营业执照（经营性活动须为营利法人）',
        '承办单位法人、操控人员身份信息和有关证照（操控员执照）',
        '无人机类型、数量、主要性能指标和实名登记信息（UOM 平台激活登记）',
        '第三方责任险证明材料（保额不低于 100 万元）',
        '活动方案（含展现的动静态图文内容）及说明、活动主体安全承诺书、活动安全工作方案和应急预案',
        '活动场地管理部门同意提供活动场地的证明',
        '其他必要信息（电子围栏设置证明、精确航线坐标 WGS-84 度分秒格式、通信联络方法、应急处置程序）'
      ],
      rhythm: [
        '活动举办前 20 日完成备案（向公安、民航、无线电、文旅、场地管理部门）',
        '各部门自收到备案内容之日起 7 日内核实，核实情况报空中交通管理机构审批',
        '拟飞行前 1 日 12:00 前向空中交通管理机构提出飞行活动申请',
        '前 1 日 21:00 前作出批准或不予批准决定（明确水平、垂直范围和使用时间）',
        '计划起飞 1 小时前报告预计起飞时刻和准备情况，经确认后方可起飞'
      ],
      note: '备案与审批是两个环节；政务审批环节全程不收费，报价中只计代办费、资质审核费与保险费。严禁「空域解禁费」「违规审批费」。'
    },
    surveyDays: venue.virtual ? 1 : 0
  }
}
