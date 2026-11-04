<template>
  <view class="page">
    <NightSky :star-count="60">
      <view class="login-hero">
        <DroneLogo :size="190" color="#7E97FF" rotor-color="#A9BCFF" light="#3DE0C0" />
        <text class="title">{{ brandName }}</text>
        <text class="sub">把夜空，变成你的舞台</text>
      </view>
    </NightSky>

    <view class="panel">
      <button class="wx-btn" @click="showAuth = true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d="M8.7 4C4.9 4 2 6.6 2 9.8c0 1.8 1 3.4 2.5 4.5l-.6 2 2.2-1.1c.7.2 1.4.3 2.1.3h.5A6 6 0 0 1 10 14c0-3.2 3-5.7 6.6-5.7h.4C16.3 5.7 12.9 4 8.7 4Zm-2 3.2a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM22 14.2c0-2.7-2.5-4.9-5.6-4.9s-5.6 2.2-5.6 4.9 2.5 4.9 5.6 4.9c.6 0 1.2-.1 1.8-.3l1.9 1-.5-1.8c1.4-1 2.4-2.3 2.4-3.8Zm-7.5-1.4a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3.8 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z"/>
        </svg>
        <text>微信授权一键登录</text>
      </button>
      <view class="agree">
        <text>登录即代表同意</text>
        <text class="link">《用户协议》</text>
        <text>与</text>
        <text class="link">《隐私政策》</text>
      </view>
    </view>

    <!-- 模拟微信授权弹层 -->
    <view v-if="showAuth" class="mask" @click="showAuth = false">
      <view class="auth-sheet" @click.stop>
        <view class="auth-head">
          <view class="auth-logo"><DroneLogo :size="56" :float="false" /></view>
          <text class="auth-title">{{ brandName }} 申请</text>
          <text class="auth-sub">获取你的昵称、头像</text>
        </view>
        <view class="auth-user">
          <image class="auth-avatar" :src="'/api/media/avatar/wechat-demo'" mode="aspectFill" />
          <view class="auth-userinfo">
            <text class="auth-nick">微信用户_8848</text>
            <text class="auth-tip">微信个人信息</text>
          </view>
        </view>
        <view class="auth-btns">
          <button class="btn deny" @click="deny">拒绝</button>
          <button class="btn allow" :disabled="loading" @click="allow">{{ loading ? '授权中…' : '允许' }}</button>
        </view>
        <text class="auth-note">演示环境 · 模拟微信 OAuth 授权流程</text>
      </view>
    </view>
  </view>
</template>

<script>
import NightSky from '@/components/NightSky.vue'
import DroneLogo from '@/components/DroneLogo.vue'
import { post, get } from '@/utils/request'
import { setLogin, store } from '@/store'

export default {
  components: { NightSky, DroneLogo },
  computed: {
    brandName() { return store.profile?.brand?.appName || '星穹 SkyShow' }
  },
  onShow() {
    if (!store.profile) get('/config/profile').then(d => { store.profile = d }).catch(() => {})
  },
  // 登录后回跳（2026-11-03）：登录门把「登录完该回到哪」带过来（requireLogin / 401 跳转都会带）。
  // 不带 redirect 时保持原行为：返回上一页。
  onLoad(opts) {
    this.redirect = (opts && opts.redirect) ? decodeURIComponent(opts.redirect) : ''
  },
  data() {
    return { showAuth: false, loading: false, redirect: '' }
  },
  methods: {
    deny() {
      this.showAuth = false
      uni.showToast({ title: '你已拒绝授权', icon: 'none' })
    },
    allow() {
      // 真实环境：uni.login 拿 code，后端 code2session 换 openid
      this.loading = true
      post('/auth/wechat-login', { nickname: '微信用户_8848', avatar: '/api/media/avatar/wechat-demo' })
        .then(d => {
          setLogin(d.token, d.user)
          uni.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => {
            if (this.redirect) {
              uni.redirectTo({ url: this.redirect, fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
              return
            }
            uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
          }, 600)
        })
        .finally(() => { this.loading = false })
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--bg); }
.login-hero { display: flex; flex-direction: column; align-items: center; padding: 120rpx 0 110rpx; }
.title { color: #fff; font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: 4rpx; margin-top: 36rpx; }
.sub { color: rgba(232,236,255,.6); font-size: var(--fs-3); margin-top: 10rpx; letter-spacing: 2rpx; }
.panel { padding: 50rpx 60rpx; display: flex; flex-direction: column; align-items: center; }
.wx-btn {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 14rpx;
  background: #07C160; color: #fff; font-size: var(--fs-7); font-weight: var(--fw-semibold);
  border-radius: 999rpx; padding: 24rpx 0; border: none;
  box-shadow: 0 10rpx 26rpx rgba(7, 193, 96, .35);
}
.wx-btn::after { border: none; }
.agree { margin-top: 28rpx; font-size: var(--fs-2); color: var(--text-3); }
.link { color: var(--primary); }
.mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(10, 12, 26, .55);
  display: flex; align-items: flex-end; justify-content: center;
}
.auth-sheet {
  width: 100%; max-width: 480px;
  background: #fff; border-radius: 32rpx 32rpx 0 0;
  padding: 44rpx 40rpx 60rpx;
  animation: rise .25s ease-out;
}
@keyframes rise { from { transform: translateY(80rpx); opacity: .6; } to { transform: none; opacity: 1; } }
.auth-head { display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.auth-logo { width: 96rpx; height: 96rpx; border-radius: 24rpx; background: #EEF2FF; display: flex; align-items: center; justify-content: center; margin-bottom: 8rpx; }
.auth-title { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.auth-sub { font-size: var(--fs-3); color: var(--text-3); }
.auth-user {
  margin-top: 36rpx; padding: 24rpx; border-radius: 20rpx; background: var(--bg);
  display: flex; align-items: center; gap: 20rpx;
}
.auth-avatar { width: 84rpx; height: 84rpx; border-radius: 50%; }
.auth-userinfo { display: flex; flex-direction: column; gap: 4rpx; }
.auth-nick { font-size: var(--fs-5); font-weight: var(--fw-semibold); }
.auth-tip { font-size: var(--fs-2); color: var(--text-3); }
.auth-btns { display: flex; gap: 24rpx; margin-top: 40rpx; }
.btn { flex: 1; border-radius: 999rpx; font-size: var(--fs-6); font-weight: var(--fw-semibold); padding: 20rpx 0; border: none; }
.btn::after { border: none; }
.btn.deny { background: var(--bg-2); color: var(--text-2); }
.btn.allow { background: #07C160; color: #fff; box-shadow: 0 8rpx 20rpx rgba(7,193,96,.3); }
.auth-note { display: block; text-align: center; font-size: var(--fs-1); color: var(--text-4); margin-top: 26rpx; }
</style>
