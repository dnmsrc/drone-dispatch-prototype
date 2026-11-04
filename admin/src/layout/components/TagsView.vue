<template>
  <div class="tags-view">
    <div class="tags-scroll">
      <router-link
        v-for="tag in tags.visited"
        :key="tag.path"
        :to="tag.path"
        class="tag-item"
        :class="{ active: route.path === tag.path }"
        @contextmenu.prevent="openMenu($event, tag)"
      >
        <span class="dot" v-if="route.path === tag.path"></span>
        {{ tag.title }}
        <el-icon
          v-if="!tag.affix"
          class="close"
          @click.prevent.stop="closeTag(tag)"
        ><Close /></el-icon>
      </router-link>
    </div>

    <teleport to="body">
      <ul
        v-show="menu.visible"
        class="context-menu"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      >
        <li @click="closeOthers">关闭其他</li>
      </ul>
    </teleport>
  </div>
</template>

<script setup>
import { reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTagsViewStore } from '../../store/tagsView'

const route = useRoute()
const router = useRouter()
const tags = useTagsViewStore()

const menu = reactive({ visible: false, x: 0, y: 0, targetPath: '' })

watch(
  () => route.fullPath,
  () => tags.add(route),
  { immediate: true }
)

function closeTag(tag) {
  const wasActive = route.path === tag.path
  tags.close(tag.path)
  if (wasActive) {
    const last = tags.visited[tags.visited.length - 1]
    router.push(last ? last.path : '/index')
  }
}

function openMenu(e, tag) {
  menu.visible = true
  menu.x = e.clientX
  menu.y = e.clientY
  menu.targetPath = tag.path
}

function closeOthers() {
  tags.closeOthers(menu.targetPath)
  router.push(menu.targetPath)
  menu.visible = false
}

function hideMenu() {
  menu.visible = false
}

onMounted(() => document.addEventListener('click', hideMenu))
onBeforeUnmount(() => document.removeEventListener('click', hideMenu))
</script>

<style scoped>
.tags-view {
  height: 34px;
  background: #fff;
  border-bottom: 1px solid #d8dce5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  padding: 0 10px;
  flex-shrink: 0;
}

.tags-scroll {
  display: flex;
  align-items: center;
  overflow-x: auto;
  white-space: nowrap;
  width: 100%;
}

.tags-scroll::-webkit-scrollbar {
  height: 4px;
}

.tag-item {
  display: inline-flex;
  align-items: center;
  height: 26px;
  line-height: 26px;
  padding: 0 10px;
  margin-right: 6px;
  font-size: 12px;
  color: #495060;
  background: #fff;
  border: 1px solid #d8dce5;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #409eff;
  margin-right: 5px;
}

.tag-item.active {
  color: #409eff;
  border-color: #b3d8ff;
  background: #ecf5ff;
}

.tag-item .close {
  margin-left: 5px;
  font-size: 12px;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tag-item .close:hover {
  background: #409eff;
  color: #fff;
}

.context-menu {
  position: fixed;
  z-index: 3000;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  font-size: 13px;
  color: #606266;
}

.context-menu li {
  padding: 7px 18px;
  cursor: pointer;
}

.context-menu li:hover {
  background: #ecf5ff;
  color: #409eff;
}
</style>
