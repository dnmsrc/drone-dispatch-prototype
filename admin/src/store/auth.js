import { defineStore } from 'pinia'
import request from '../utils/request'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('admin_token') || '',
    admin: JSON.parse(localStorage.getItem('admin_info') || 'null')
  }),
  getters: {
    role: (s) => s.admin?.role || '',
    name: (s) => s.admin?.name || s.admin?.username || '',
    isAdmin: (s) => s.admin?.role === 'ADMIN'
  },
  actions: {
    async login(form) {
      const data = await request.post('/admin/login', {
        username: form.username,
        password: form.password
      })
      this.token = data.token
      this.admin = data.admin
      localStorage.setItem('admin_token', data.token)
      localStorage.setItem('admin_info', JSON.stringify(data.admin))
    },
    logout() {
      this.token = ''
      this.admin = null
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_info')
    }
  }
})
