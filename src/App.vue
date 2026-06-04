<template>
  <div id="game-app">
    <!-- 顶部资源栏 -->
    <header class="resource-bar">
      <div class="res-item">灵石 {{ fmt(store.state.lingstone) }}</div>
      <div class="res-item">灵气 {{ fmt(store.state.qi) }}</div>
      <div class="res-item">体力 {{ Math.floor(store.state.stamina) }}/{{ store.state.maxStamina }}</div>
    </header>

    <!-- 主内容区 -->
    <main class="main-content">
      <ZongmenView v-show="activeTab === 'zongmen'" />
      <DisciplesView v-show="activeTab === 'disciples'" />
      <ExploreView v-show="activeTab === 'explore'" />
      <LogView v-show="activeTab === 'log'" />
    </main>

    <!-- 底部导航 -->
    <nav class="bottom-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['nav-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        <span class="nav-icon">{{ tab.icon }}</span>
        <span class="nav-label">{{ tab.label }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useGameStore } from './stores/gameStore.js'
import ZongmenView from './components/ZongmenView.vue'
import DisciplesView from './components/DisciplesView.vue'
import ExploreView from './components/ExploreView.vue'
import LogView from './components/LogView.vue'

const store = useGameStore()
const activeTab = ref('zongmen')

function fmt(n) {
  if (!n) return '0'
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return Math.floor(n).toLocaleString()
}

const tabs = [
  { id: 'zongmen', label: '宗门', icon: '🏯' },
  { id: 'disciples', label: '弟子', icon: '👥' },
  { id: 'explore', label: '探索', icon: '🗺️' },
  { id: 'log', label: '日志', icon: '📜' }
]

onMounted(() => {
  const loaded = store.loadGame()
  if (loaded) {
    store.processOffline()
  } else {
    store.state.gameStarted = true
    store.addLog('system', '太虚宗正式开山立派！')
    store.saveGame()
  }
})
</script>