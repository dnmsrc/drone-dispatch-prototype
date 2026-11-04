<template>
  <div class="navbar">
    <div class="left">
      <el-icon class="fold-btn" @click="$emit('toggle')">
        <Expand v-if="collapsed" />
        <Fold v-else />
      </el-icon>
      <el-breadcrumb separator="/" class="crumb">
        <el-breadcrumb-item :to="{ path: '/index' }">首页</el-breadcrumb-item>
        <el-breadcrumb-item v-if="route.meta?.title && route.path !== '/index'">
          {{ route.meta.title }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>
    <div class="right">
      <el-tooltip content="全屏" placement="bottom">
        <el-icon class="action-icon" @click="toggleFullscreen"><FullScreen /></el-icon>
      </el-tooltip>
      <el-dropdown trigger="click" @command="onCommand">
        <div class="avatar-box">
          <el-avatar :size="30" :src="avatarUrl" />
          <span class="nick">{{ auth.name }}</span>
          <el-icon><CaretBottom /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">
              <el-icon><UserFilled /></el-icon>个人中心
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useAuthStore } from '../../store/auth'

defineProps({ collapsed: Boolean, isMobile: Boolean })
defineEmits(['toggle'])

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const avatarUrl = computed(() => `/api/media/avatar/admin-${auth.admin?.username || 'user'}`)

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen()
  }
}

async function onCommand(cmd) {
  if (cmd === 'profile') {
    router.push('/user/profile')
  } else if (cmd === 'logout') {
    await ElMessageBox.confirm('确认退出登录吗？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    })
    auth.logout()
    ElMessage.success('已退出登录')
    router.replace('/login')
  }
}
</script>

<style scoped>
.navbar {
  height: 50px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
  position: relative;
  z-index: 9;
}

.left {
  display: flex;
  align-items: center;
}

.fold-btn {
  font-size: 18px;
  cursor: pointer;
  margin-right: 16px;
  color: #5a5e66;
}

.fold-btn:hover {
  color: #409eff;
}

.right {
  display: flex;
  align-items: center;
}

.action-icon {
  font-size: 18px;
  color: #5a5e66;
  cursor: pointer;
  margin-right: 18px;
}

.action-icon:hover {
  color: #409eff;
}

.avatar-box {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #606266;
}

.avatar-box .nick {
  margin: 0 4px 0 8px;
  font-size: 14px;
}

/* 小屏：隐藏面包屑与昵称，避免挤压 */
@media (max-width: 576px) {
  .crumb {
    display: none;
  }

  .avatar-box .nick {
    display: none;
  }

  .action-icon {
    margin-right: 12px;
  }

  .navbar {
    padding: 0 10px;
  }
}
</style>
