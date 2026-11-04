// 品牌外观：启动时从 /api/config/profile 拉取（业务档案驱动，通用模板换业务零改前端代码）
// 拉取失败时回落到默认值，保证离线/后端未启动时界面不空白
import { reactive } from 'vue'
import request from './request'

export const brand = reactive({
  appName: '星穹 SkyShow',
  adminTitle: '星穹派单管理后台',
  slogan: '',
  footer: '',
  description: ''
})

export async function loadBrand() {
  try {
    const data = await request.get('/config/profile')
    if (data && data.brand) Object.assign(brand, data.brand)
  } catch (e) {
    // Mock Server 未启动时使用默认品牌
  }
  document.title = brand.adminTitle
  return brand
}
