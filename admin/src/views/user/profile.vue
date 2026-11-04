<template>
  <div class="page">
    <el-row :gutter="16">
      <el-col :xs="24" :md="10">
        <div class="card profile-card">
          <el-avatar :size="88" :src="avatarUrl" />
          <h2 class="name">{{ auth.name }}</h2>
          <el-tag :type="auth.isAdmin ? 'danger' : 'primary'" effect="light">
            {{ auth.isAdmin ? '管理员' : '操作员' }}
          </el-tag>
          <el-descriptions :column="1" border style="margin-top: 22px; width: 100%">
            <el-descriptions-item label="登录账号">{{ auth.admin?.username }}</el-descriptions-item>
            <el-descriptions-item label="姓名">{{ auth.name }}</el-descriptions-item>
            <el-descriptions-item label="角色">{{ auth.admin?.role }}</el-descriptions-item>
            <el-descriptions-item label="权限范围">
              {{ auth.isAdmin ? '全部功能（接单执行 / 退款审批 / 档期与系统配置）' : '接单执行、档期查看（无退款审批与配置权限）' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-col>
      <el-col :xs="24" :md="14">
        <div class="card">
          <h3 class="card-title">修改密码</h3>
          <el-form ref="pwdRef" :model="pwd" :rules="pwdRules" label-width="90px" style="max-width: 420px">
            <el-form-item label="原密码" prop="oldPwd">
              <el-input v-model="pwd.oldPwd" type="password" show-password placeholder="请输入原密码" />
            </el-form-item>
            <el-form-item label="新密码" prop="newPwd">
              <el-input v-model="pwd.newPwd" type="password" show-password placeholder="6-20 位字符" />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirmPwd">
              <el-input v-model="pwd.confirmPwd" type="password" show-password placeholder="再次输入新密码" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="submitPwd">保存修改</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../store/auth'

const auth = useAuthStore()
const avatarUrl = computed(() => `/api/media/avatar/admin-${auth.admin?.username || 'user'}`)

const pwdRef = ref()
const pwd = reactive({ oldPwd: '', newPwd: '', confirmPwd: '' })

const pwdRules = {
  oldPwd: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPwd: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度为 6-20 位', trigger: 'blur' }
  ],
  confirmPwd: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (r, v, cb) => (v === pwd.newPwd ? cb() : cb(new Error('两次输入的密码不一致'))),
      trigger: 'blur'
    }
  ]
}

async function submitPwd() {
  await pwdRef.value.validate()
  ElMessage.info('演示环境不支持修改密码')
}
</script>

<style scoped>
.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
}

.name {
  margin: 14px 0 8px;
  font-size: 20px;
  color: #303133;
}
</style>
