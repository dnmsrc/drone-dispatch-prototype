import { defineStore } from 'pinia'

// Tags-View 多标签页状态
export const useTagsViewStore = defineStore('tagsView', {
  state: () => ({
    visited: [] // [{ path, title, affix }]
  }),
  actions: {
    add(route) {
      if (!route.meta?.title || route.meta?.noTag) return
      if (this.visited.some((v) => v.path === route.path)) return
      this.visited.push({
        path: route.path,
        title: route.meta.title,
        affix: !!route.meta.affix
      })
    },
    close(path) {
      const i = this.visited.findIndex((v) => v.path === path)
      if (i > -1 && !this.visited[i].affix) {
        this.visited.splice(i, 1)
      }
    },
    closeOthers(path) {
      this.visited = this.visited.filter((v) => v.affix || v.path === path)
    }
  }
})
