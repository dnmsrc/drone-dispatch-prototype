<template>
  <div class="login-page">
    <!-- 【原型专用 · 评审辅助】登录页“?”悬浮说明，正式系统删除本行及 import 即可 -->
    <ProtoTip mode="fixed" />
    <div class="glow glow-1"></div>
    <div class="glow glow-2"></div>

    <div class="login-card">
      <div class="brand">
        <svg viewBox="0 0 48 48" width="44" height="44" fill="none">
          <circle cx="10" cy="10" r="7" stroke="#409EFF" stroke-width="2.5" />
          <circle cx="38" cy="10" r="7" stroke="#409EFF" stroke-width="2.5" />
          <circle cx="10" cy="38" r="7" stroke="#409EFF" stroke-width="2.5" />
          <circle cx="38" cy="38" r="7" stroke="#409EFF" stroke-width="2.5" />
          <rect x="18" y="18" width="12" height="12" rx="3" fill="#409EFF" />
          <path d="M15 15l5 5M33 15l-5 5M15 33l5-5M33 33l-5-5" stroke="#409EFF" stroke-width="2.5" stroke-linecap="round" />
        </svg>
        <h1>{{ brand.appName }}</h1>
        <p>{{ brand.adminTitle }}</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="请输入账号" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            :prefix-icon="Lock"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-form-item prop="captcha">
          <div class="captcha-row">
            <el-input
              v-model="form.captcha"
              placeholder="验证码"
              :prefix-icon="Key"
              maxlength="4"
              @keyup.enter="submit"
            />
            <div class="captcha-img" title="演示验证码固定为 1234" @click="shuffle">
              <span
                v-for="(ch, i) in captchaChars"
                :key="i"
                :style="{ transform: `rotate(${ch.deg}deg) translateY(${ch.dy}px)`, color: ch.color }"
              >{{ ch.text }}</span>
            </div>
          </div>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="form.remember">记住密码</el-checkbox>
        </el-form-item>
        <el-button class="login-btn" type="primary" size="large" :loading="loading" @click="submit">
          登 录
        </el-button>
      </el-form>

      <div class="demo-tip">
        <p>演示账号：admin / admin123（管理员）</p>
        <p>operator / operator123（操作员）</p>
      </div>
    </div>

    <div class="footer">{{ brand.footer }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { brand } from '../../utils/brand'
import { User, Lock, Key } from '@element-plus/icons-vue'
import { useAuthStore } from '../../store/auth'
import ProtoTip from '../../components/ProtoTip.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref()
const loading = ref(false)
const form = reactive({ username: '', password: '', captcha: '', remember: false })

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  captcha: [{ required: true, message: '请输入验证码', trigger: 'blur' }]
}

const captchaChars = ref([])

function shuffle() {
  // 伪验证码：内容固定 1234，仅刷新视觉样式
  const colors = ['#2b5876', '#4e4376', '#409EFF', '#7b5ea7']
  captchaChars.value = '1234'.split('').map((text, i) => ({
    text,
    deg: Math.floor(Math.random() * 30) - 15,
    dy: Math.floor(Math.random() * 6) - 3,
    color: colors[(i + Math.floor(Math.random() * 4)) % 4]
  }))
}

onMounted(() => {
  shuffle()
  const saved = JSON.parse(localStorage.getItem('remember_account') || 'null')
  if (saved) {
    form.username = saved.username
    form.password = saved.password
    form.remember = true
  }
})

async function submit() {
  await formRef.value.validate()
  if (form.captcha !== '1234') {
    ElMessage.error('验证码错误，演示验证码为 1234')
    shuffle()
    return
  }
  loading.value = true
  try {
    await auth.login(form)
    if (form.remember) {
      localStorage.setItem('remember_account', JSON.stringify({ username: form.username, password: form.password }))
    } else {
      localStorage.removeItem('remember_account')
    }
    ElMessage.success('登录成功，欢迎回来')
    router.push(route.query.redirect || '/')
  } catch {
    shuffle()
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  background: linear-gradient(135deg, #2b5876 0%, #4e4376 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.35;
}

.glow-1 {
  width: 420px;
  height: 420px;
  background: #409eff;
  top: -120px;
  left: -100px;
}

.glow-2 {
  width: 380px;
  height: 380px;
  background: #9b59b6;
  bottom: -100px;
  right: -80px;
}

.login-card {
  width: 400px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 8px;
  padding: 36px 36px 28px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  position: relative;
  z-index: 1;
}

@media (max-width: 480px) {
  .login-card {
    padding: 28px 22px 22px;
  }
}

.brand {
  text-align: center;
  margin-bottom: 26px;
}

.brand h1 {
  margin: 10px 0 4px;
  font-size: 24px;
  color: #303133;
  letter-spacing: 2px;
}

.brand p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.captcha-row {
  display: flex;
  width: 100%;
  gap: 10px;
}

.captcha-img {
  width: 118px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 4px;
  background: linear-gradient(120deg, #eef2fb, #e6e9f5);
  border: 1px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  position: relative;
}

.captcha-img::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  top: 50%;
  height: 1px;
  background: rgba(78, 67, 118, 0.35);
  transform: rotate(-4deg);
}

.captcha-img span {
  display: inline-block;
  font-size: 20px;
  font-weight: 700;
  font-style: italic;
  margin: 0 3px;
  font-family: Georgia, serif;
}

.login-btn {
  width: 100%;
  letter-spacing: 8px;
  font-size: 16px;
}

.demo-tip {
  margin-top: 18px;
  background: #f4f6fb;
  border: 1px dashed #c8d0e0;
  border-radius: 4px;
  padding: 8px 14px;
}

.demo-tip p {
  margin: 4px 0;
  font-size: 12px;
  color: #909399;
  text-align: center;
}

.footer {
  position: absolute;
  bottom: 18px;
  width: 100%;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  letter-spacing: 1px;
}
</style>
