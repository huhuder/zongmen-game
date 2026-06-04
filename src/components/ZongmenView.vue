<template>
  <div class="zongmen-view">
    <!-- 宗门名称 -->
    <h1 class="clan-title">{{ store.state.clanName }}</h1>
    <p class="clan-subtitle">宗门等级 · Lv.{{ store.state.clanLevel }} · 声望 {{ store.state.reputation }}</p>

    <!-- 资源面板 -->
    <div class="res-panel">
      <div class="res-card">
        <div class="res-icon lingstone-icon"></div>
        <div class="res-info">
          <span class="res-value">{{ formatNum(store.state.lingstone) }}</span>
          <span class="res-label">灵石</span>
        </div>
        <span class="res-rate">+{{ store.getLingstonePerHour() }}/时</span>
      </div>
      <div class="res-card">
        <div class="res-icon qi-icon"></div>
        <div class="res-info">
          <span class="res-value">{{ formatNum(store.state.qi) }}</span>
          <span class="res-label">灵气</span>
        </div>
        <span class="res-rate">+{{ store.getQiPerHour() }}/时</span>
      </div>
      <div class="res-card">
        <div class="res-icon stamina-icon"></div>
        <div class="res-info">
          <span class="res-value">{{ Math.floor(store.state.stamina) }}/{{ store.state.maxStamina }}</span>
          <span class="res-label">体力</span>
        </div>
        <span class="res-rate">+{{ store.getStaminaPerHour() }}/时</span>
      </div>
    </div>

    <!-- 材料栏 -->
    <div class="materials-row" v-if="hasMaterials">
      <span v-for="(amt, name) in store.state.materials" :key="name" class="mat-tag" v-show="amt > 0">
        {{ name }} <strong>{{ amt }}</strong>
      </span>
    </div>

    <div class="divider"></div>

    <!-- 建筑列表 -->
    <h3 class="section-title">宗门建筑</h3>
    <div class="building-list">
      <div
        v-for="b in sortedBuildings"
        :key="b.id"
        class="build-card"
        :class="{ 'build-locked': !b.unlocked, 'build-upgrading': b.state.upgrading }"
      >
        <div class="build-top">
          <div class="build-header">
            <span class="build-icon">{{ getBuildIcon(b.id) }}</span>
            <div class="build-name-group">
              <span class="build-name">{{ b.data.name }}</span>
              <span class="build-tier" :class="'tier-' + b.data.tier">{{ tierLabel(b.data.tier) }}</span>
            </div>
          </div>
          <div class="build-level-badge" v-if="b.unlocked && b.state.level > 0">
            Lv.{{ b.state.level }}
          </div>
          <div class="build-locked-badge" v-if="!b.unlocked">
            未解锁
          </div>
        </div>

        <p class="build-desc">{{ b.data.description }}</p>

        <!-- 解锁条件 -->
        <div v-if="!b.unlocked" class="build-hint">
          解锁条件：{{ getUnlockHint(b.id) }}
        </div>

        <!-- 升级中的倒计时 -->
        <div v-if="b.state.upgrading" class="upgrade-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: upgradePercent(b) + '%' }"></div>
          </div>
          <span class="progress-text">升级中 {{ formatTime(b.remaining) }}</span>
        </div>

        <!-- 可升级操作 -->
        <div v-if="b.unlocked && !b.isMaxLevel && !b.state.upgrading" class="upgrade-action">
          <div class="upgrade-costs">
            <span class="cost-item cost-lingstone">灵石 {{ formatNum(b.nextLevel.lingstone) }}</span>
            <span v-for="(amt, mat) in b.nextLevel.materials" :key="mat" class="cost-item cost-material">
              {{ mat }} {{ amt }}
            </span>
            <span class="cost-item cost-time">耗时 {{ formatTime(b.nextLevel.time_sec) }}</span>
          </div>
          <button
            class="btn btn-primary upgrade-btn"
            :disabled="!b.canUpgrade"
            @click="doUpgrade(b.id)"
          >
            升级至 Lv.{{ b.state.level + 1 }}
          </button>
        </div>

        <!-- 已满级 -->
        <div v-if="b.isMaxLevel" class="max-mark">
          <span class="seal">满</span>
          <span>已达最高等级</span>
        </div>

        <!-- 效果展示 -->
        <div v-if="b.unlocked && b.state.level > 0 && !b.isMaxLevel" class="build-effects">
          <span v-for="(text, key) in getEffectText(b.id)" :key="key" class="effect-tag">{{ text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/gameStore.js'

const store = useGameStore()
const now = ref(Date.now())
let timer = null

onMounted(() => { timer = setInterval(() => now.value = Date.now(), 1000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const allBuildings = [
  { id: 'main_hall', name: '大殿', tier: 'basic', desc: '宗门核心，决定宗门等级与弟子上限', unlock: null, icon: '殿' },
  { id: 'warehouse', name: '仓库', tier: 'basic', desc: '储备资源，提升存储上限', unlock: null, icon: '库' },
  { id: 'training_room', name: '修炼室', tier: 'basic', desc: '弟子挂机修炼之所', unlock: { building: 'main_hall', level: 2 }, icon: '修' },
  { id: 'library', name: '藏经阁', tier: 'functional', desc: '收录功法秘籍，弟子可在此学习技能', unlock: { building: 'main_hall', level: 3 }, icon: '经' },
  { id: 'alchemy_room', name: '炼丹房', tier: 'functional', desc: '炼制丹药，助力弟子突破', unlock: { building: 'main_hall', level: 4 }, icon: '丹' },
  { id: 'forge', name: '铸器坊', tier: 'functional', desc: '锻造神兵利器，强化战力', unlock: { building: 'main_hall', level: 5 }, icon: '器' },
  { id: 'guard_array', name: '护山大阵', tier: 'advanced', desc: '宗门防御阵法', unlock: { building: 'main_hall', level: 6 }, icon: '阵' },
  { id: 'arena', name: '演武场', tier: 'advanced', desc: '弟子切磋较技', unlock: { building: 'main_hall', level: 7 }, icon: '武' }
]

const sortedBuildings = computed(() => {
  const tierOrder = { basic: 0, functional: 1, advanced: 2 }
  return allBuildings.map(b => {
    const state = store.getBuildingState(b.id)
    const data = store.getBuildingData(b.id)
    const unlocked = store.isBuildingUnlocked(b.id)
    const maxLevel = data ? data.max_level : 10
    const isMaxLevel = state.level >= maxLevel
    const nextLevelData = store.getBuildingUpgradeData(b.id)
    const canUpgrade = nextLevelData && store.canAfford({ lingstone: nextLevelData.lingstone, materials: nextLevelData.materials })
    const remaining = store.getUpgradeRemaining(b.id)
    let upgradeTotal = 0
    if (state.upgrading && nextLevelData) {
      upgradeTotal = nextLevelData.time_sec
    }
    return {
      id: b.id,
      data: { ...b, description: b.desc, tier: b.tier, icon: b.icon },
      unlocked,
      state,
      isMaxLevel,
      nextLevel: nextLevelData,
      canUpgrade,
      remaining,
      upgradeTotal
    }
  }).sort((a, b) => tierOrder[a.data.tier] - tierOrder[b.data.tier])
})

const hasMaterials = computed(() => Object.values(store.state.materials).some(v => v > 0))

function tierLabel(tier) {
  return { basic: '基础', functional: '功能', advanced: '高级' }[tier] || ''
}
function getBuildIcon(id) {
  return allBuildings.find(b => b.id === id)?.icon || '?'
}
function getUnlockHint(id) {
  const data = store.getBuildingData(id)
  if (!data?.unlock) return ''
  const b = allBuildings.find(x => x.id === data.unlock.building)
  return `${b?.name || data.unlock.building} Lv.${data.unlock.level}`
}
function getEffectText(id) {
  const data = store.getBuildingData(id)
  const state = store.getBuildingState(id)
  if (!data || state.level === 0) return {}
  const lv = data.levels[state.level - 1]
  if (!lv?.effect) return {}
  const e = lv.effect
  const t = {}
  if (e.clan_level) t.clan = `宗门 Lv.+${e.clan_level}`
  if (e.disciple_max) t.disciple = `弟子 ${e.disciple_max}人`
  if (e.cultivate_speed) t.cultivate = `修炼 ×${e.cultivate_speed}`
  if (e.storage_limit) t.storage = `存储 ${formatNum(e.storage_limit)}`
  if (e.defense) t.defense = `防御 +${e.defense}`
  if (e.combat_bonus) t.combat = `战力 ×${e.combat_bonus}`
  if (e.skill_slots) t.skill = `功法 +${e.skill_slots}`
  if (e.forge_slots) t.forge = `锻造 +${e.forge_slots}`
  if (e.pill_slots) t.pill = `炼丹 +${e.pill_slots}`
  return t
}
function upgradePercent(b) {
  if (!b.upgradeTotal || !b.remaining) return 0
  return Math.min(100, Math.max(0, ((b.upgradeTotal - b.remaining) / b.upgradeTotal) * 100))
}
function doUpgrade(id) {
  const r = store.startUpgrade(id)
  if (!r.success) alert(r.reason)
}
function formatTime(s) {
  if (!s || s <= 0) return '0秒'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  if (h > 0) return `${h}时${m}分`
  if (m > 0) return `${m}分${ss}秒`
  return `${ss}秒`
}
function formatNum(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return Math.floor(n).toLocaleString()
}
</script>

<style scoped>
.zongmen-view {
  padding-bottom: 8px;
}
.clan-subtitle {
  text-align: center;
  font-size: 12px;
  color: var(--ink-light);
  margin-bottom: 14px;
  letter-spacing: 1px;
}

/* 资源面板 */
.res-panel {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.res-card {
  flex: 1;
  background: linear-gradient(135deg, rgba(245,240,230,0.9), rgba(232,220,200,0.9));
  border: 1px solid var(--border-ink);
  border-radius: 3px;
  padding: 10px 8px;
  text-align: center;
  position: relative;
}
.res-icon {
  width: 28px; height: 28px;
  margin: 0 auto 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}
.lingstone-icon {
  background: linear-gradient(135deg, #f9e4a0, #d4a84b);
  border: 1px solid #c9a84c;
}
.lingstone-icon::after { content: '灵'; color: #6b3a00; font-size: 12px; }
.qi-icon {
  background: linear-gradient(135deg, #c8e6c9, #6b8e6b);
  border: 1px solid #5a8a5a;
}
.qi-icon::after { content: '气'; color: #1a3a1a; font-size: 12px; }
.stamina-icon {
  background: linear-gradient(135deg, #ffccbc, #d45a33);
  border: 1px solid #c53d13;
}
.stamina-icon::after { content: '体'; color: #4a1500; font-size: 12px; }
.res-info {
  display: flex;
  flex-direction: column;
}
.res-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-dark);
}
.res-label {
  font-size: 10px;
  color: var(--ink-light);
}
.res-rate {
  font-size: 9px;
  color: var(--jade);
  display: block;
  margin-top: 3px;
}

/* 材料 */
.materials-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.mat-tag {
  display: inline-block;
  padding: 3px 10px;
  background: rgba(107, 93, 74, 0.08);
  border: 1px solid var(--border-ink);
  border-radius: 2px;
  font-size: 12px;
  color: var(--ink-medium);
}
.mat-tag strong {
  color: var(--ink-dark);
}

.section-title {
  font-size: 15px;
  color: var(--ink-dark);
  letter-spacing: 2px;
  margin-bottom: 10px;
  padding-left: 10px;
  border-left: 3px solid var(--vermillion);
}

/* 建筑卡片 */
.build-card {
  background: linear-gradient(135deg,
    rgba(250,247,240,0.95) 0%,
    rgba(245,240,230,0.95) 100%);
  border: 1px solid var(--border-ink);
  border-radius: 3px;
  padding: 14px;
  margin-bottom: 10px;
  position: relative;
  box-shadow: 0 1px 3px var(--shadow-ink);
  transition: border-color 0.3s;
}
.build-card.build-locked {
  opacity: 0.55;
  background: rgba(245,240,230,0.6);
}
.build-card.build-upgrading {
  border-color: rgba(197, 61, 19, 0.3);
  box-shadow: 0 0 8px rgba(197, 61, 19, 0.08);
}
.build-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.build-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.build-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px; height: 36px;
  background: rgba(44, 36, 22, 0.06);
  border: 1px solid var(--border-ink);
  border-radius: 3px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink-dark);
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
}
.build-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink-dark);
  letter-spacing: 1px;
}
.build-tier {
  display: block;
  font-size: 10px;
  letter-spacing: 1px;
  margin-top: 1px;
}
.tier-basic { color: var(--ink-light); }
.tier-functional { color: var(--jade); }
.tier-advanced { color: var(--vermillion); }
.build-level-badge {
  padding: 3px 10px;
  background: rgba(201, 168, 76, 0.12);
  border: 1px solid rgba(201, 168, 76, 0.3);
  border-radius: 2px;
  font-size: 12px;
  color: var(--gold-dark);
  font-weight: 600;
}
.build-locked-badge {
  padding: 3px 10px;
  background: rgba(107, 93, 74, 0.08);
  border: 1px solid var(--border-ink);
  border-radius: 2px;
  font-size: 11px;
  color: var(--ink-light);
}
.build-desc {
  font-size: 12px;
  color: var(--ink-light);
  margin-bottom: 8px;
  line-height: 1.5;
}
.build-hint {
  font-size: 11px;
  color: var(--vermillion);
  padding: 6px 10px;
  background: rgba(197, 61, 19, 0.06);
  border-radius: 2px;
  margin-bottom: 8px;
}

/* 升级进度条 */
.upgrade-progress {
  margin-bottom: 6px;
}
.progress-bar {
  height: 4px;
  background: var(--paper-dark);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--vermillion), var(--vermillion-light));
  border-radius: 2px;
  transition: width 1s linear;
}
.progress-text {
  font-size: 11px;
  color: var(--vermillion);
}

/* 升级操作 */
.upgrade-action {
  margin-top: 4px;
}
.upgrade-costs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.cost-item {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 2px;
  border: 1px solid var(--border-ink);
}
.cost-lingstone {
  background: rgba(201, 168, 76, 0.08);
  border-color: rgba(201, 168, 76, 0.3);
}
.cost-material {
  background: rgba(107, 142, 107, 0.08);
  border-color: rgba(107, 142, 107, 0.3);
}
.cost-time {
  background: rgba(107, 93, 74, 0.06);
}
.upgrade-btn {
  width: 100%;
  padding: 10px;
}

.max-mark {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--ink-light);
  margin-top: 6px;
}
.build-effects {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-ink);
}
.effect-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(107, 142, 107, 0.06);
  border: 1px solid rgba(107, 142, 107, 0.2);
  border-radius: 2px;
  color: var(--jade);
}
</style>