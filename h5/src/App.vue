<script>
import { store } from './store'
import { get } from './utils/request'

export default {
  onLaunch() {
    store.token = uni.getStorageSync('token') || ''
    store.user = uni.getStorageSync('user') || null
    // 业务档案（品牌外观）：通用模板换业务零改 H5 品牌文案
    get('/config/profile').then(d => {
      store.profile = d
      console.log(`${d.brand?.appName || '派单系统'} 启动`)
    }).catch(() => {})
  }
}
</script>

<style>
/* 全局设计变量 */
:root, page {
  --primary: #4A6CF7;
  --primary-deep: #3553C8;
  --cyan: #3DE0C0;
  --night-1: #141B3D;
  --night-2: #0B1026;
  --bg: #F6F7FB;
  --card: #FFFFFF;
  --text-1: #1A1D2E;
  --text-2: #5A6072;
  --text-3: #9AA0B5;
  --line: #ECEEF5;

  /* 步骤条语言（2026-10-27 定稿）：没保存过的 = 灰、保存过的（当前之前）= 绿、当前 = 蓝。
     当前之后的步骤一律灰 —— 它只是「还没走到」，不能因为演示预置了数据就显示成已保存。
     走过的路（已保存 → 当前）用蓝色流动虚线，方向朝当前步。 */
  --step-idle-line: #E4E7F1;                       /* 未保存：浅灰环 */
  --step-idle-text: #9AA0B5;                       /* 未保存：灰字（数字 + 标签） */
  --step-accent: var(--primary);                   /* 当前步：蓝（保持原样） */
  --step-accent-soft: rgba(74, 108, 247, 0.12);   /* 当前步的淡蓝底 */
  --step-accent-line: rgba(74, 108, 247, 0.55);   /* 当前步的蓝描边 */
  --step-saved: var(--success);                    /* 已保存：绿（勾 / 字 / 描边，勾走 currentColor） */
  --step-saved-soft: rgba(43, 164, 113, 0.10);    /* 已保存（当前之前）的淡绿底 */
  --step-saved-line: rgba(43, 164, 113, 0.42);    /* 已保存的绿描边 */
  --step-dash: #E4E7F1;                            /* 未保存段虚线（灰） */
  --step-flow: var(--primary);                     /* 走过的路（已保存 → 当前）：蓝色流动虚线 */
  --step-flow-soft: rgba(74, 108, 247, 0.22);        /* 流动虚线的空档，流动才看得出来 */

  /* 全站文字 / 状态色：页面里硬编码的同语义值统一归到这里，一个语义只留一个值 */
  /* 次要文字（2026-11-03 用户指出「我的预约」标签看不清）：原本 #9AA0B5 在白色卡片上只有
     2.6:1 对比度，远低于 WCAG AA 正文 4.5:1。加深到 #636B7C 后白底 5.2:1、浅灰底(#F2F3F9) 4.7:1 达标。
     判据 tools/e2e/audit-unify.mjs 的 D 项（对比度）逐页复核。 */
  --text-3: #636B7C;
  --text-4: #C9CEDE;     /* 占位、时间戳、禁用态 */
  --bg-2: #F2F3F9;       /* 内嵌浅块、分段选项底 */
  --success: #2BA471;
  --danger: #F56C6C;
  --warn: #E6A23C;
  --primary-2: #6C8BFF;  /* 主按钮渐变的第二色，和 --primary 同族 */

  /* 字号阶梯（12 档，按尺寸升序）。全站原本散在 20~68rpx 约 20 档、336 处，这轮把 12 档之外的
     散值就近吸附：18→20、25→24、38→40、44/46/48→44、56/64/68→64，最大偏差 8rpx（约 4px）。
     --fs-9 原来是 40，现在 36 占 9、40 移到 --fs-10；步骤条与 App 公共块都没引用 --fs-9，所以安全。 */
  --fs-1: 20rpx;   /* 时间戳 / 注脚 / 小标签 */
  --fs-2: 22rpx;   /* 次要说明、标签（步骤条标签、点内数字） */
  --fs-3: 24rpx;   /* 小正文 */
  --fs-4: 26rpx;   /* 正文（表单、列表项、键值行） */
  --fs-5: 28rpx;   /* 基准正文（page 已用） */
  --fs-6: 30rpx;   /* 小标题、按钮文字 */
  --fs-7: 32rpx;   /* 卡片标题、大按钮 */
  --fs-8: 34rpx;   /* 强调数字、档位数字 */
  --fs-9: 36rpx;   /* 图标、页面主标题 */
  --fs-10: 40rpx;  /* 金额、结算总价 */
  --fs-11: 44rpx;  /* 大数字、slogan、登录标题 */
  --fs-12: 64rpx;  /* 收银台 / 退款页的金额特写 */
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  --fw-heavy: 800;   /* 大数字、金额、slogan：全站原来散着写 800，约 60 处，这里也收成变量 */

  --radius: 24rpx;
  --shadow: 0 8rpx 30rpx rgba(26, 29, 46, 0.06);
}

page {
  background: var(--bg);
  color: var(--text-1);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;
  font-size: var(--fs-5);
  line-height: 1.5;
}

view, text, scroll-view, swiper, button, input, textarea, image { box-sizing: border-box; }

/* 勾选标记统一用 CSS 画，不用 ✓(U+2713) 字符：该字符在不少系统字体里缺字，
   渲染出来是一个「?」，会把勾选框里本该是勾的位置压成一个白色问号。
   用 currentColor，任何勾选态直接套，无需每页再写一份。 */
.gck {
  flex: none;
  width: 15rpx; height: 9rpx;
  border-left: 3rpx solid currentColor;
  border-bottom: 3rpx solid currentColor;
  transform: rotate(-45deg);
}

/* H5 输入组件兜底：uni-input/uni-textarea 是自定义元素，内部原生控件靠 100% 高度继承，
   宿主没有显式高度时会塌缩为 0（表现为点击无法输入）。统一给一个最小内容高度。 */
uni-input, uni-textarea { display: block; box-sizing: border-box; }
uni-input .uni-input-input, uni-textarea .uni-textarea-textarea { min-height: 48rpx; }
/* 2026-11-03（用户：补充说明输入框右侧留白）：uni 基础样式表（uni.xxxx.css）给 uni-textarea 设了
   width:300px / height:150px；页面只给宿主元素 class 设了 padding 与背景，宽度就停在 300px ——
   480 视口下卡片内容区约 434px，输入框只占 300px，右侧空出 100px 以上（用户截图红框标的是它）。
   选择器用 uni-textarea[class]（特异性 0,0,1,1）压过基础表的 (0,0,0,1)：与上面 uni-button 同一处理，
   不再依赖样式表插入顺序（dev 与构建产物的顺序相反，同特异性会被反杀）。 */
uni-textarea[class] { width: 100%; }

/* H5 按钮兜底：uni-button 自带 margin-left/right: auto，在 flex 容器里会阻止交叉轴拉伸，
   使按钮收缩成内容宽（文字被挤出、按钮呈圆形）。项目内所有按钮均显式声明宽度/位置，
   这里全局归零，防止任何页面踩同一个坑。
   选择器用 uni-button[class]（特异性 0,0,1,1）而不是裸 uni-button（0,0,0,1）：
   uni 的 H5 基础样式表里也有裸 uni-button 规则，两条同特异性时谁后插入谁赢 ——
   生产构建（8090）里我们的样式在后，dev server（5173）里 base 在后，
   于是同一份源码在两条链路上表现不一致（用户看到的就是 dev 上被覆盖的旧效果）。
   加一个属性选择器后不再依赖插入顺序。 */
uni-button[class] { margin-left: 0; margin-right: 0; }

/* 按钮行高归一（2026-10-28）：uni-button 默认行高 2.55×字号（实测 24rpx 字号 → 行高 35.2px），
   按钮高度 = padding + 行高 = 101rpx，比同一行的输入框（88rpx）高 13rpx——用户截图里那个被拉高的方块
   就是这么来的。单行控件标准高度 = 88rpx（44px，H5/小程序通用触摸目标），行高压回 1.5（与正文一致）后
   按钮高度回落到 min-height 88rpx。判据 tools/e2e/verify-spacing.mjs 第 8 条：单行控件恰好 88rpx、
   同一 flex 行内控件必须齐高、行内控件不得带 margin。 */
uni-button[class], button { line-height: 1.5; }

/* 按钮文字几何居中（2026-11-03）：uni-button 是 display:block，行高压回 1.5 后，
   按钮高度靠 min-height:88rpx 撑起、字号只有 12–15px 时，单行文字从顶部起排 →
   「我的预约」空态的「去预约表演」实测偏上 12px（用户截图红框标的就是它）。
   改成 flex 居中后垂直偏差归零，同时把「文字 + 箭头」这类组合内容也一起水平居中
   （首页 CTA 实测偏左 13px）。安全前提已用 tools/e2e/probe-btnkids.mjs 扫过全站：
   所有 uni-button 要么只有纯文本节点，要么已经是 flex 行（首页 .cta、登录 .wx-btn）。 */
uni-button[class] { display: flex; align-items: center; justify-content: center; }

/* 文本列下限（2026-10-28）：CJK 没有词边界，flex 文本项的 min-width:auto = 1 个字，
   被挤窄时整列逐字竖排（用户看到的「竖排」就是这么来的）。所有文本列给显式下限 110rpx（≈4 字），
   长文本正常换行；判据 tools/e2e/verify-spacing.mjs 逐行字数 < 4 判失败。 */

/* 通用卡片 */
.card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 24rpx;
}

/* 通用主按钮 */
.btn-primary {
  background: linear-gradient(135deg, #4A6CF7 0%, #6C8BFF 100%);
  color: #fff;
  border-radius: 999rpx;
  font-weight: var(--fw-semibold);
  box-shadow: 0 10rpx 24rpx rgba(74, 108, 247, 0.35);
  border: none;
  /* 单行控件触摸目标下限 88rpx：订单空态「去预约一场表演」原来只有 71rpx(35.5px) 高，
     比同一屏的其它按钮矮一截，也不达 44px 触摸标准 */
  min-height: 88rpx;
  box-sizing: border-box;
  padding: 0 40rpx;
}
.btn-primary::after { border: none; }
.btn-ghost {
  background: #fff;
  color: var(--primary);
  border: 2rpx solid var(--primary);
  border-radius: 999rpx;
}
.btn-ghost::after { border: none; }
.btn-disabled {
  background: #C9CEDE !important;
  color: #fff !important;
  box-shadow: none !important;
}

/* 分区标题 */
.sec-title {
  font-size: var(--fs-7);
  font-weight: var(--fw-bold);
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.sec-title::before {
  content: '';
  width: 8rpx;
  height: 30rpx;
  border-radius: 4rpx;
  background: linear-gradient(180deg, var(--primary), var(--cyan));
}
.sec-sub { font-size: var(--fs-3); color: var(--text-3); font-weight: 400; margin-left: 8rpx; }

/* ===== 桌面宽屏自适应：以手机栏宽（480px）居中演示 =====
   uni-app H5 按「视口宽 / 23.4375」设置 rem 基准，宽屏下整个界面会被等比放大；
   这里在视口 >480px 时锁定 rem 基准（与 480px 视口连续衔接），并把页面限宽居中。
   各页 fixed 底栏 / 底部弹层 / TabBar 已带 max-width:480px + margin auto，会随视口自动居中。 */
@media (min-width: 481px) {
  html { font-size: 20.48px !important; } /* = 480 / 23.4375 */
  body {
    background: radial-gradient(1200px 640px at 50% -10%, #1B2450 0%, #0B1026 62%) fixed;
  }
  uni-page-body {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    box-shadow: 0 0 60rpx rgba(8, 12, 32, 0.55);
  }
}
</style>
