import { createSSRApp } from 'vue'
import App from './App.vue'
// 【原型专用 · 评审辅助】页面左上角“?”悬浮说明，正式系统删除下一行及 import 即可
import { installProtoTip } from './proto-tip'

export function createApp() {
  const app = createSSRApp(App)
  installProtoTip()
  return { app }
}
