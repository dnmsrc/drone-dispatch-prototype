// ==================== 业务档案（Biz Profile）：无人机编队表演 ====================
// 本系统是「通用派单模板」：订单状态机、派单、退款阶梯、档期、字典、后台框架均为业务无关内核。
// 换业务时复制本文件改一份（如 biz/cleaning.js），并替换 seed.js 顶部的 require 即可。
// profile 承载三类业务特征：
//   1. brand    —— 品牌外观（双端标题/名称/标语）
//   2. pricing  —— 计价模型种子（档位/时长/附加服务/图案/时段，入库后全走字典管理，可在线改）
//   3. dictRefs —— 计价引擎读取的字典类型标识映射
'use strict';

module.exports = {
  key: 'drone-show',
  name: '无人机编队表演',

  // ---- 品牌（双端通过 /api/config/profile 实时获取） ----
  brand: {
    appName: '星穹 SkyShow',
    adminTitle: '星穹派单管理后台',
    slogan: '无人机编队灯光表演 · 一站式预约',
    footer: '星穹 SkyShow · 无人机编队灯光表演预约派单平台',
    description: '无人机编队灯光表演一站式预约平台'
  },

  // ---- 计价引擎 ↔ 字典类型标识映射 ----
  dictRefs: {
    tier: 'drone_tier',       // 规格档位：键=架次，值=基础价
    duration: 'duration',     // 服务时长：键=分钟，值=加价
    pattern: 'pattern',       // 预设图案（本业务特有选项）
    addon: 'addon',           // 附加服务：值=加价
    timeSlot: 'time_slot',    // 可约时段
    refundRule: 'refund_rule' // 退款阶梯：键=距服务小时数下限，值=退款比例
  },

  // ---- 计价模型种子（首次建库时写入字典与配置，之后在线维护） ----
  pricing: {
    tiers: [
      { drones: 100, price: 18800, desc: '适合小型告白、生日惊喜' },
      { drones: 200, price: 28800, desc: '适合婚礼、周年庆典' },
      { drones: 300, price: 38800, desc: '适合大型求婚、品牌发布' },
      { drones: 500, price: 58800, desc: '适合企业年会、城市活动' },
      { drones: 1000, price: 98800, desc: '适合大型节庆、城市级表演' }
    ],
    durations: [
      { minutes: 10, extra: 0, label: '10 分钟（标准）' },
      { minutes: 15, extra: 6000, label: '15 分钟' },
      { minutes: 20, extra: 12000, label: '20 分钟' }
    ],
    customTextPrice: 2000,
    customLogoPrice: 5000,
    addons: [
      { key: 'music', label: '专属音乐编曲', price: 1000 },
      { key: 'narration', label: '现场旁白解说', price: 2000 },
      { key: 'aerial', label: '双机位航拍记录', price: 3000 },
      { key: 'urgent', label: '加急服务（48h 内安排）', price: 8000 }
    ],
    patterns: [
      { key: 'heart', label: '爱心' },
      { key: 'ring', label: '钻戒' },
      { key: 'star', label: '星辰' },
      { key: 'phoenix', label: '凤凰' },
      { key: 'rose', label: '玫瑰' },
      { key: 'moon', label: '月亮船' }
    ],
    // 时段是「整点区间」，18:00-19:00 这种任意起止都算合法；这里只是默认三段，管理员可在档期页增删
    timeSlots: ['19:00-20:00', '20:00-21:00', '21:00-22:00'],
    dailyLimit: 3,
    bookingWindowDays: 60,
    payExpireMinutes: 15
  },

  // ---- 退款阶梯种子 ----
  refundRules: [
    { minHours: 168, ratio: 0.9, label: '距表演 7 天以上，退 90%' },
    { minHours: 72, ratio: 0.5, label: '距表演 3-7 天，退 50%' },
    { minHours: 24, ratio: 0.2, label: '距表演 1-3 天，退 20%' },
    { minHours: 0, ratio: 0, label: '距表演不足 24 小时，不可退款' }
  ]
};
