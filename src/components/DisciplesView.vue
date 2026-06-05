<template>
  <div class="disciples-view">
    <div class="disciple-header">
      <div>
        <h2>弟子管理</h2>
        <span class="disciple-count">{{ store.state.disciples.length }} / {{ store.discipleMax }}</span>
      </div>
    </div>

    <!-- 招募区 -->
    <section class="recruit-section">
      <div class="section-title">
        <span>招募弟子</span>
        <button
          class="btn btn-sm"
          :disabled="!canFreeRefresh"
          @click="doRefresh(false)"
        >免费刷新</button>
        <button
          class="btn btn-sm btn-primary"
          :disabled="store.state.materials['招贤令'] < 1"
          @click="doRefresh(true)"
        >招贤令刷新 ({{ store.state.materials['招贤令'] || 0 }})</button>
      </div>
      <div class="recruit-pool" v-if="recruitPool.length">
        <div
          v-for="(d, idx) in recruitPool"
          :key="idx"
          class="recruit-card"
          :style="{ borderColor: getQualityColor(d.quality) }"
        >
          <div class="recruit-card-name">
            <span class="quality-badge" :style="{ background: getQualityColor(d.quality) }">
              {{ getQualityName(d.quality) }}
            </span>
            {{ d.name }}
          </div>
          <div class="recruit-card-info">
            <span>攻{{ d.base_stats.atk }}</span>
            <span>防{{ d.base_stats.def }}</span>
            <span>血{{ d.base_stats.hp }}</span>
          </div>
          <div class="recruit-card-talents" v-if="d.talents.length">
            <span
              v-for="t in d.talents"
              :key="t.id"
              class="talent-tag"
            >{{ t.name }}</span>
          </div>
          <div class="recruit-card-talents" v-else>
            <span class="no-talent">无天赋</span>
          </div>
          <button
            class="btn btn-primary btn-sm"
            :disabled="!canRecruit(idx)"
            @click="doRecruit(idx, true)"
          >招募</button>
        </div>
      </div>
      <p v-else class="empty-hint">点击刷新，发现新的弟子。</p>
    </section>

    <!-- 弟子列表 -->
    <section class="disciple-list-section">
      <div class="section-title">弟子列表</div>
      <div v-if="store.state.disciples.length" class="disciple-list">
        <div
          v-for="d in store.state.disciples"
          :key="d.id"
          class="disciple-card"
          :style="{ borderLeftColor: getQualityColor(d.quality) }"
        >
          <div class="disciple-card-main">
            <div class="disciple-name-line">
              <span class="quality-tag" :style="{ background: getQualityColor(d.quality) }">
                {{ getQualityName(d.quality) }}
              </span>
              <strong class="disciple-name">{{ d.name }}</strong>
              <span class="realm-text">{{ d.realm.name }}·{{ d.realm.sub_name }}</span>
            </div>
            <div class="disciple-stats">
              攻{{ d.base_stats.atk }} 防{{ d.base_stats.def }} 血{{ d.base_stats.hp }}
            </div>
            <div class="disciple-talents" v-if="d.talents.length">
              <span v-for="t in d.talents" :key="t.id" class="talent-tag">{{ t.name }}</span>
            </div>
          </div>
          <div class="disciple-card-actions">
            <template v-if="d.cultivate_until > 0">
              <div class="cultivate-progress">
                <div
                  class="progress-bar"
                  :style="{ width: cultivatePercent(d) + '%', background: getQualityColor(d.quality) }"
                ></div>
              </div>
              <span class="cultivate-time">{{ getRemainingText(d) }}</span>
              <button class="btn btn-sm" @click="store.cancelCultivate(d.id)">完成</button>
            </template>
            <template v-else>
              <button class="btn btn-sm btn-primary" @click="store.startCultivate(d.id)">修炼</button>
              <button
                class="btn btn-sm"
                :disabled="d.realm.sub_idx < 3 || !store.spendLingstone(0)"
                @click="doBreakthrough(d)"
              >突破</button>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="empty-hint">暂无弟子，请先招募。</p>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore.js'

const store = useGameStore()
const recruitPool = ref([])

const canFreeRefresh = ref(true)

function getQualityName(q) {
  return store.getQualityName(q)
}

function getQualityColor(q) {
  const map = { common: '#9e9e9e', rare: '#4caf50', epic: '#9c27b0', legendary: '#ff9800' }
  return map[q] || '#9e9e9e'
}

function doRefresh(useToken) {
  if (!useToken && !canFreeRefresh.value) return
  if (useToken && store.state.materials['招贤令'] < 1) return
  recruitPool.value = store.generateRecruitPool(3)
  if (!useToken) {
    canFreeRefresh.value = false
  }
}

function canRecruit(idx) {
  return idx < recruitPool.value.length
}

function doRecruit(idx, useToken) {
  const d = recruitPool.value[idx]
  if (!d) return
  const result = store.recruitDisciple(d, useToken)
  if (result.success) {
    recruitPool.value.splice(idx, 1)
  } else {
    alert(result.reason)
  }
}

function doBreakthrough(d) {
  const cost = store.state.lingstone < 200 ? 0 : 1 // will check inside
  const result = store.tryBreakthrough(d.id)
  if (!result.success) {
    alert(result.reason)
  } else {
    alert(result.breakthrough ? '突破成功！' : '突破失败')
  }
}

function cultivatePercent(d) {
  if (d.cultivate_until <= 0) return 0
  const total = store.getCultureDuration(d.id) * 1000
  const remaining = Math.max(0, d.cultivate_until - Date.now())
  return Math.max(0, Math.round((1 - remaining / total) * 100))
}

function getRemainingText(d) {
  const sec = store.getCultureRemaining(d.id)
  return store.formatDurationText(sec)
}
</script>

<style scoped>
.disciples-view {
  padding: 16px;
}

.disciple-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.disciple-header h2 {
  margin: 0;
  display: inline;
}

.disciple-count {
  margin-left: 12px;
  font-size: 14px;
  color: #8a8a8a;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #d4d4d4;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.recruit-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #1e1e2e;
  border-radius: 8px;
}

.recruit-pool {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.recruit-card {
  flex: 1;
  min-width: 180px;
  max-width: 220px;
  background: #2a2a3a;
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
}

.recruit-card-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #eee;
}

.quality-badge {
  display: inline-block;
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  margin-right: 4px;
}

.recruit-card-info {
  font-size: 12px;
  color: #8a8a8a;
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.recruit-card-talents {
  margin-bottom: 8px;
  min-height: 24px;
}

.talent-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  margin: 2px 2px 0 0;
  background: #333;
  color: #aaa;
  border-radius: 3px;
}

.no-talent {
  font-size: 11px;
  color: #555;
}

.btn {
  padding: 4px 12px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #333;
  color: #ccc;
  cursor: pointer;
  font-size: 13px;
}

.btn:hover { background: #444; }

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: #3d5afe;
  border-color: #3d5afe;
  color: #fff;
}

.btn-primary:hover { background: #536dfe; }

.btn-sm {
  padding: 3px 10px;
  font-size: 12px;
}

/* 弟子列表 */
.disciple-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.disciple-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e1e2e;
  border-left: 4px solid #999;
  border-radius: 6px;
  padding: 10px 14px;
}

.disciple-card-main {
  flex: 1;
}

.disciple-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.quality-tag {
  font-size: 10px;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
}

.disciple-name {
  font-size: 15px;
  color: #eee;
}

.realm-text {
  font-size: 12px;
  color: #8a8a8a;
}

.disciple-stats {
  font-size: 12px;
  color: #6a6a6a;
  margin-bottom: 2px;
}

.disciple-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  justify-content: flex-end;
}

.cultivate-progress {
  width: 80px;
  height: 6px;
  background: #333;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 1s linear;
}

.cultivate-time {
  font-size: 11px;
  color: #8a8a8a;
  min-width: 50px;
}

.empty-hint {
  color: #555;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}
</style>
