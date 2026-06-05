<template>
  <div class="explore-view">
    <!-- ===== 阶段1：副本选择 ===== -->
    <div v-if="!store.state.exploring && stage === 'select'" class="stage-select">
      <h2 class="explore-title">秘境探索</h2>
      <p class="explore-subtitle">派遣弟子探索秘境，获取灵石与材料</p>

      <div
        v-for="d in dungeons"
        :key="d.id"
        class="dungeon-card"
        :class="{ 'dungeon-locked': store.state.clanLevel < d.unlock_level }"
      >
        <div class="dungeon-header">
          <span class="dungeon-icon">{{ dungeonIcons[d.id] }}</span>
          <div>
            <h3 class="dungeon-name">{{ d.name }}</h3>
            <span class="badge" :class="'badge-diff-' + d.difficulty">{{ diffLabel(d.difficulty) }}</span>
          </div>
        </div>
        <p class="dungeon-desc">{{ d.description }}</p>

        <div v-if="store.state.clanLevel < d.unlock_level" class="dungeon-lock-hint">
          需要宗门等级 {{ d.unlock_level }} 解锁
        </div>

        <div v-else class="dungeon-footer">
          <div class="dungeon-meta">
            <span>节点 {{ d.node_count[0] }}-{{ d.node_count[1] }}</span>
            <span class="cost-stamina">体力 -20</span>
          </div>
          <button
            class="btn btn-primary"
            :disabled="store.state.stamina < 20"
            @click="doStartExplore(d.id)"
          >
            进入探索
          </button>
        </div>
      </div>

      <div v-if="store.state.stamina < 20" class="stamina-warn">
        体力不足，请等待体力恢复（当前 {{ Math.floor(store.state.stamina) }}/{{ store.state.maxStamina }}）
      </div>
    </div>

    <!-- ===== 阶段2：节点地图 ===== -->
    <div v-if="store.state.exploring && stage === 'exploring'" class="stage-map">
      <!-- 顶部：进度信息 -->
      <div class="map-header">
        <h2 class="map-dungeon-name">{{ store.state.currentDungeon?.name }}</h2>
        <div class="map-progress">
          第 {{ store.state.currentNodeIndex + 1 }} / {{ store.state.dungeonNodes.length }} 节点
        </div>
        <div class="map-progress-bar">
          <div
            class="map-progress-fill"
            :style="{ width: ((store.state.currentNodeIndex + 1) / store.state.dungeonNodes.length * 100) + '%' }"
          ></div>
        </div>
      </div>

      <!-- 节点链 -->
      <div class="node-chain">
        <div
          v-for="(node, i) in store.state.dungeonNodes"
          :key="i"
          class="node-wrapper"
        >
          <!-- 连接线 -->
          <div
            v-if="i > 0"
            class="node-line"
            :class="{ 'line-cleared': store.state.dungeonNodes[i - 1].cleared }"
          ></div>

          <!-- 节点 -->
          <div
            class="node-icon"
            :class="[
              'node-type-' + node.type,
              {
                'node-current': i === store.state.currentNodeIndex && !node.cleared,
                'node-cleared': node.cleared,
                'node-unreached': i > store.state.currentNodeIndex && !node.cleared
              }
            ]"
          >
            <span class="node-symbol">{{ nodeSymbol(node.type) }}</span>
          </div>
        </div>
      </div>

      <!-- 当前节点交互区 -->
      <div v-if="currentNode" class="node-interact card">
        <!-- 战斗 / Boss 节点 -->
        <template v-if="currentNode.type === 'battle' || currentNode.type === 'boss'">
          <div class="battle-card" :class="{ 'boss-card': currentNode.type === 'boss' }">
            <div class="battle-enemy-name">{{ currentNode.data.name }}</div>
            <div class="battle-stats">
              <span class="stat-hp">HP {{ currentNode.data.hp }}</span>
              <span class="stat-atk">ATK {{ currentNode.data.atk }}</span>
              <span v-if="currentNode.data.def" class="stat-def">DEF {{ currentNode.data.def }}</span>
            </div>
            <div v-if="currentNode.data.reward_lingstone" class="battle-reward-hint">
              奖励：灵石 {{ currentNode.data.reward_lingstone[0] }}-{{ currentNode.data.reward_lingstone[1] }}
              <span v-if="currentNode.data.reward_material?.length">
                + {{ currentNode.data.reward_material.join('、') }}
              </span>
            </div>
            <button
              v-if="!battleDone"
              class="btn btn-primary battle-btn"
              :class="{ 'boss-btn': currentNode.type === 'boss' }"
              @click="resolveBattle()"
            >
              {{ currentNode.type === 'boss' ? '挑战 Boss' : '战斗' }}
            </button>

            <!-- 战斗结果 -->
            <div v-if="battleDone" class="battle-result card">
              <div class="result-header" :class="battleWin ? 'result-win' : 'result-lose'">
                {{ battleWin ? '胜利！' : '败北...' }}
              </div>
              <p class="result-detail">{{ battleMsg }}</p>
              <div v-if="battleReward" class="result-rewards">
                <span v-if="battleReward.lingstone" class="reward-item reward-lingstone">
                  灵石 +{{ battleReward.lingstone }}
                </span>
                <span v-for="(amt, mat) in battleReward.materials" :key="mat" class="reward-item reward-material">
                  {{ mat }} +{{ amt }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- 事件节点 -->
        <template v-if="currentNode.type === 'event' && !eventDone">
          <div class="event-card">
            <p class="event-text">{{ currentNode.data.text }}</p>
            <div class="event-options">
              <button
                v-for="(opt, oi) in currentNode.data.options"
                :key="oi"
                class="btn btn-secondary event-opt-btn"
                @click="resolveEvent(oi)"
              >
                {{ opt.text }}
              </button>
            </div>
          </div>
        </template>
        <template v-if="currentNode.type === 'event' && eventDone">
          <div class="event-result card">
            <p class="result-detail">{{ eventMsg }}</p>
            <div v-if="eventReward" class="result-rewards">
              <span v-for="(amt, mat) in eventReward" :key="mat" class="reward-item reward-material">
                {{ mat }} +{{ amt }}
              </span>
            </div>
          </div>
        </template>

        <!-- 宝箱节点 -->
        <template v-if="currentNode.type === 'chest' && !chestDone">
          <div class="chest-card">
            <div class="chest-icon">宝</div>
            <p class="chest-text">发现一个宝箱，里面似乎有东西……</p>
            <button class="btn btn-primary" @click="resolveChest()">打开宝箱</button>
          </div>
        </template>
        <template v-if="currentNode.type === 'chest' && chestDone">
          <div class="chest-result card">
            <p class="result-detail">打开了宝箱！</p>
            <div v-if="chestReward" class="result-rewards">
              <span v-if="chestReward.lingstone" class="reward-item reward-lingstone">
                灵石 +{{ chestReward.lingstone }}
              </span>
              <span v-for="(amt, mat) in chestReward.materials" :key="mat" class="reward-item reward-material">
                {{ mat }} +{{ amt }}
              </span>
            </div>
          </div>
        </template>

        <!-- 休息节点 -->
        <template v-if="currentNode.type === 'rest' && !restDone">
          <div class="rest-card">
            <div class="rest-icon">休</div>
            <p class="rest-text">一处安全的角落，可稍作休整恢复体力。</p>
            <button class="btn btn-green" @click="resolveRest()">休息一下</button>
          </div>
        </template>
        <template v-if="currentNode.type === 'rest' && restDone">
          <div class="rest-result card">
            <p class="result-detail">体力恢复 +{{ restAmount }}</p>
          </div>
        </template>

        <!-- 前进按钮 -->
        <div v-if="nodeCompleted" class="advance-area">
          <button
            v-if="!isLastNode"
            class="btn btn-primary advance-btn"
            @click="goNextNode()"
          >
            继续前进
          </button>
          <button
            v-else
            class="btn btn-primary advance-btn boss-clear-btn"
            @click="doFinishExplore()"
          >
            完成探索，查看结算
          </button>
        </div>
      </div>

      <!-- 底部放弃按钮 -->
      <div class="abandon-area">
        <button class="btn btn-red abandon-btn" @click="doAbandon()">放弃探索</button>
      </div>
    </div>

    <!-- ===== 阶段3：结算面板 ===== -->
    <div v-if="stage === 'settlement' && settlement" class="stage-settlement">
      <h2 class="explore-title">探索结算</h2>
      <p class="explore-subtitle">{{ settlement.dungeonName }} 探索完成</p>

      <div class="card settlement-card">
        <h3 class="settlement-section-title">探索日志</h3>
        <div class="settlement-log">
          <div
            v-for="(entry, ei) in settlement.log"
            :key="ei"
            class="log-entry"
          >
            <span class="log-index">#{{ ei + 1 }}</span>
            <span class="log-type" :class="'log-type-' + entry.type">{{ typeLabel(entry.type) }}</span>
            <span class="log-name">{{ entry.name }}</span>
            <span v-if="entry.reward?.lingstone" class="log-reward">灵石 +{{ entry.reward.lingstone }}</span>
          </div>
        </div>

        <div class="divider"></div>

        <h3 class="settlement-section-title">总收益</h3>
        <div class="total-rewards">
          <div class="total-item total-lingstone">
            <span class="total-label">灵石</span>
            <span class="total-value">+{{ settlement.totalLingstone }}</span>
          </div>
          <div
            v-for="(amt, mat) in settlement.totalMaterials"
            :key="mat"
            class="total-item total-material"
          >
            <span class="total-label">{{ mat }}</span>
            <span class="total-value">+{{ amt }}</span>
          </div>
          <div v-if="Object.keys(settlement.totalMaterials).length === 0 && settlement.totalLingstone === 0" class="total-empty">
            本次探索未获得收益
          </div>
        </div>
      </div>

      <button class="btn btn-primary settlement-back-btn" @click="stage = 'select'">
        回到副本列表
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useGameStore } from '../stores/gameStore.js'
import dungeonsData from '../../data/dungeons.json'

const store = useGameStore()

// 阶段：select / exploring / settlement
const stage = ref('select')

// 战斗中状态
const battleDone = ref(false)
const battleWin = ref(false)
const battleMsg = ref('')
const battleReward = ref(null)

// 事件状态
const eventDone = ref(false)
const eventMsg = ref('')
const eventReward = ref(null)

// 宝箱状态
const chestDone = ref(false)
const chestReward = ref(null)

// 休息状态
const restDone = ref(false)
const restAmount = ref(0)

// 结算数据
const settlement = ref(null)

const dungeons = computed(() => dungeonsData.dungeons)
const dungeonIcons = {
  dun_forest: '雾',
  dun_ruins: '墟',
  dun_volcano: '岩'
}

const currentNode = computed(() => {
  if (!store.state.exploring || !store.state.dungeonNodes.length) return null
  return store.state.dungeonNodes[store.state.currentNodeIndex]
})

const nodeCompleted = computed(() => {
  if (!currentNode.value) return false
  if (currentNode.value.type === 'battle' || currentNode.value.type === 'boss') return battleDone.value
  if (currentNode.value.type === 'event') return eventDone.value
  if (currentNode.value.type === 'chest') return chestDone.value
  if (currentNode.value.type === 'rest') return restDone.value
  return false
})

const isLastNode = computed(() => {
  return store.state.currentNodeIndex >= store.state.dungeonNodes.length - 1
})

function diffLabel(d) {
  return { 1: '简单', 2: '普通', 3: '困难' }[d] || '?'
}

function nodeSymbol(type) {
  return { battle: '武', event: '?', chest: '箱', rest: '休', boss: '王' }[type] || '?'
}

function typeLabel(type) {
  return { battle: '战斗', event: '事件', chest: '宝箱', rest: '休息', boss: 'Boss' }[type] || type
}

function resetNodeState() {
  battleDone.value = false
  battleWin.value = false
  battleMsg.value = ''
  battleReward.value = null
  eventDone.value = false
  eventMsg.value = ''
  eventReward.value = null
  chestDone.value = false
  chestReward.value = null
  restDone.value = false
  restAmount.value = 0
}

function doStartExplore(id) {
  const result = store.startExplore(id)
  if (!result.success) {
    alert(result.reason)
    return
  }
  stage.value = 'exploring'
  resetNodeState()
}

function randomRange(arr) {
  const [min, max] = arr
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pickRandomDisciple() {
  const disciples = store.state.disciples
  if (disciples.length === 0) {
    return { name: '无名弟子', atk: 10, hp: 100 }
  }
  const d = disciples[Math.floor(Math.random() * disciples.length)]
  return { name: d.name, atk: d.atk || 10, hp: d.hp || 100 }
}

function resolveBattle() {
  const node = currentNode.value
  if (!node) return

  const enemy = node.data
  const disciple = pickRandomDisciple()

  const dAtk = disciple.atk || 10
  const eAtk = enemy.atk || 10
  const baseRate = dAtk / (dAtk + eAtk) * 0.5
  const fluctuation = (Math.random() - 0.5) * 0.3
  const winRate = Math.min(0.95, Math.max(0.05, baseRate + fluctuation))
  const win = Math.random() < winRate

  battleWin.value = win
  if (win) {
    battleMsg.value = `${disciple.name} 战胜了 ${enemy.name}！`
  } else {
    battleMsg.value = `${disciple.name} 不敌 ${enemy.name}，败退。`
  }

  const fullLingstone = enemy.reward_lingstone ? randomRange(enemy.reward_lingstone) : 0
  const lingstone = win ? fullLingstone : Math.floor(fullLingstone / 2)
  const materials = {}
  if (enemy.reward_material && enemy.reward_material.length > 0) {
    for (const mat of enemy.reward_material) {
      const count = Math.floor(Math.random() * 3) + 1
      if (!win) {
        materials[mat] = Math.max(1, Math.floor(count / 2))
      } else {
        materials[mat] = count
      }
    }
  }

  battleReward.value = { lingstone, materials }
  battleDone.value = true

  store.clearNode({ lingstone, materials })
}

function resolveEvent(optionIndex) {
  const node = currentNode.value
  if (!node) return
  const opt = node.data.options[optionIndex]
  const effect = opt.effect

  eventDone.value = true
  eventMsg.value = `选择了「${opt.text}」`

  const reward = { lingstone: 0, materials: {} }
  let hasReward = false

  if (effect) {
    // Check for battle trigger
    if (effect.battle) {
      eventMsg.value += `，触发了与 ${effect.battle} 的战斗！`
      // Simple battle resolution for event-triggered battles
      const lingstoneBonus = randomRange([20, 60])
      reward.lingstone += lingstoneBonus
      hasReward = true
    }

    for (const [key, val] of Object.entries(effect)) {
      if (key === 'battle') continue
      if (key === 'random') {
        if (Math.random() > 0.5) {
          const bonusLing = randomRange([50, 150])
          reward.lingstone += bonusLing
          eventMsg.value += ' 获得了额外灵石！'
          hasReward = true
        } else {
          eventMsg.value += ' 但什么也没发生……'
        }
        continue
      }
      if (Array.isArray(val)) {
        const amt = randomRange(val)
        if (amt > 0) {
          reward.materials[key] = amt
          hasReward = true
        }
      }
    }
  }

  if (hasReward) {
    eventReward.value = {}
    if (reward.lingstone > 0) eventReward.value['灵石'] = reward.lingstone
    Object.assign(eventReward.value, reward.materials)
    store.clearNode({ lingstone: reward.lingstone, materials: reward.materials })
  } else {
    store.clearNode(null)
  }
}

function resolveChest() {
  const dungeon = store.state.currentDungeon
  const diff = dungeon?.difficulty || 1
  const lingstone = randomRange([30 * diff, 100 * diff])
  const mats = ['矿石', '灵草', '功法残卷']
  const matName = mats[Math.floor(Math.random() * mats.length)]
  const matCount = Math.floor(Math.random() * 3 * diff) + 1

  chestReward.value = { lingstone, materials: { [matName]: matCount } }
  chestDone.value = true
  store.clearNode({ lingstone, materials: { [matName]: matCount } })
}

function resolveRest() {
  const amount = 10 + Math.floor(Math.random() * 11)
  store.state.stamina = Math.min(store.state.maxStamina, store.state.stamina + amount)
  restAmount.value = amount
  restDone.value = true
  store.clearNode({ lingstone: 0, materials: {} })
  store.saveGame()
}

function goNextNode() {
  const node = store.nextNode()
  resetNodeState()
  if (!node) {
    doFinishExplore()
  }
}

function doFinishExplore() {
  const dungeonName = store.state.currentDungeon?.name || '秘境'
  const result = store.finishExplore()
  settlement.value = {
    dungeonName,
    ...result
  }
  stage.value = 'settlement'
}

function doAbandon() {
  if (confirm('确定放弃本次探索吗？已消耗的体力不会返还。')) {
    store.abandonExplore()
    stage.value = 'select'
    resetNodeState()
  }
}
</script>

<style scoped>
.explore-view {
  padding-bottom: 8px;
}

/* ===== 标题 ===== */
.explore-title {
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 28px;
  text-align: center;
  color: var(--ink-dark);
  letter-spacing: 4px;
  margin-bottom: 2px;
}
.explore-title::after {
  content: '';
  display: block;
  width: 50px;
  height: 2px;
  background: var(--vermillion);
  margin: 4px auto 0;
  opacity: 0.6;
}
.explore-subtitle {
  text-align: center;
  font-size: 12px;
  color: var(--ink-light);
  letter-spacing: 1px;
  margin-bottom: 16px;
}

/* ===== 阶段1：副本卡片 ===== */
.dungeon-card {
  background: linear-gradient(135deg,
    rgba(250,247,240,0.95) 0%,
    rgba(245,240,230,0.95) 100%);
  border: 1px solid var(--border-ink);
  border-radius: 3px;
  padding: 16px;
  margin-bottom: 12px;
  position: relative;
  box-shadow: 0 1px 4px var(--shadow-ink);
  transition: all 0.2s;
}
.dungeon-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-gold), transparent);
  opacity: 0.4;
}
.dungeon-card.dungeon-locked {
  opacity: 0.5;
}
.dungeon-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.dungeon-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 2px solid var(--vermillion);
  border-radius: 2px;
  color: var(--vermillion);
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 22px;
  font-weight: 700;
  transform: rotate(-3deg);
  opacity: 0.8;
}
.dungeon-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink-dark);
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.badge-diff-1 {
  background: rgba(107, 142, 107, 0.12);
  color: var(--jade);
  border: 1px solid rgba(107, 142, 107, 0.3);
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 2px;
}
.badge-diff-2 {
  background: rgba(201, 168, 76, 0.12);
  color: var(--gold-dark);
  border: 1px solid rgba(201, 168, 76, 0.3);
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 2px;
}
.badge-diff-3 {
  background: rgba(197, 61, 19, 0.1);
  color: var(--vermillion);
  border: 1px solid rgba(197, 61, 19, 0.3);
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 2px;
}
.dungeon-desc {
  font-size: 13px;
  color: var(--ink-light);
  line-height: 1.6;
  margin-bottom: 12px;
}
.dungeon-lock-hint {
  font-size: 12px;
  color: var(--vermillion);
  padding: 8px;
  background: rgba(197, 61, 19, 0.06);
  border-radius: 2px;
  text-align: center;
}
.dungeon-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dungeon-meta {
  font-size: 12px;
  color: var(--ink-light);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cost-stamina {
  color: var(--vermillion);
}
.stamina-warn {
  text-align: center;
  font-size: 12px;
  color: var(--vermillion);
  padding: 10px;
  background: rgba(197, 61, 19, 0.06);
  border: 1px solid rgba(197, 61, 19, 0.2);
  border-radius: 3px;
  margin-top: 8px;
}

/* ===== 阶段2：节点地图 ===== */
.map-header {
  text-align: center;
  margin-bottom: 18px;
  padding: 12px;
  background: linear-gradient(135deg,
    rgba(245,240,230,0.9),
    rgba(232,220,200,0.9));
  border: 1px solid var(--border-ink);
  border-radius: 3px;
}
.map-dungeon-name {
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 24px;
  color: var(--ink-dark);
  letter-spacing: 3px;
  margin-bottom: 4px;
}
.map-progress {
  font-size: 12px;
  color: var(--ink-light);
  margin-bottom: 8px;
}
.map-progress-bar {
  height: 4px;
  background: var(--paper-dark);
  border-radius: 2px;
  overflow: hidden;
}
.map-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--vermillion), var(--vermillion-light));
  border-radius: 2px;
  transition: width 0.4s ease;
}

/* 节点链 */
.node-chain {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}
.node-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.node-line {
  width: 2px;
  height: 24px;
  background: linear-gradient(180deg, var(--paper-dark), var(--paper-dark));
  transition: background 0.3s;
}
.node-line.line-cleared {
  background: linear-gradient(180deg, var(--jade-light), var(--paper-dark));
}
.node-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 2px solid var(--border-ink);
  border-radius: 2px;
  transform: rotate(45deg);
  transition: all 0.3s;
}
.node-icon .node-symbol {
  transform: rotate(-45deg);
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 18px;
  font-weight: 700;
}
.node-type-battle {
  border-color: rgba(197, 61, 19, 0.5);
  background: rgba(197, 61, 19, 0.06);
}
.node-type-battle .node-symbol { color: var(--vermillion); }
.node-type-event {
  border-color: rgba(201, 168, 76, 0.5);
  background: rgba(201, 168, 76, 0.06);
}
.node-type-event .node-symbol { color: var(--gold-dark); }
.node-type-chest {
  border-color: rgba(201, 168, 76, 0.5);
  background: rgba(201, 168, 76, 0.06);
}
.node-type-chest .node-symbol { color: var(--gold-dark); }
.node-type-rest {
  border-color: rgba(107, 142, 107, 0.5);
  background: rgba(107, 142, 107, 0.06);
}
.node-type-rest .node-symbol { color: var(--jade); }
.node-type-boss {
  border-color: rgba(123, 94, 167, 0.6);
  background: rgba(123, 94, 167, 0.08);
}
.node-type-boss .node-symbol { color: var(--quality-purple); }

.node-current {
  transform: rotate(45deg) scale(1.2);
  box-shadow: 0 0 14px rgba(197, 61, 19, 0.25);
  z-index: 1;
}
.node-type-boss.node-current {
  box-shadow: 0 0 18px rgba(123, 94, 167, 0.3);
}
.node-cleared {
  opacity: 0.35;
  border-style: dashed;
}
.node-unreached {
  opacity: 0.3;
}

/* 交互区 */
.node-interact {
  margin-bottom: 12px;
}

/* 战斗卡片 */
.battle-card {
  text-align: center;
}
.boss-card {
  border: 1px dashed rgba(123, 94, 167, 0.3);
  padding: 12px;
  background: rgba(123, 94, 167, 0.03);
  border-radius: 3px;
}
.battle-enemy-name {
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 24px;
  color: var(--ink-dark);
  margin-bottom: 8px;
}
.boss-card .battle-enemy-name {
  font-size: 28px;
  color: var(--quality-purple);
}
.battle-stats {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 10px;
  font-size: 13px;
}
.stat-hp { color: var(--vermillion); font-weight: 600; }
.stat-atk { color: var(--gold-dark); font-weight: 600; }
.stat-def { color: var(--jade); font-weight: 600; }
.battle-reward-hint {
  font-size: 11px;
  color: var(--ink-light);
  margin-bottom: 14px;
}
.battle-btn {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}
.boss-btn {
  background: var(--quality-purple);
  border-color: var(--quality-purple);
  box-shadow: 0 2px 10px rgba(123, 94, 167, 0.3);
}
.boss-btn:hover {
  background: #8f6fba;
}

/* 战斗结果 */
.result-header {
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 26px;
  text-align: center;
  margin-bottom: 8px;
}
.result-win { color: var(--jade); }
.result-lose { color: var(--vermillion); }
.result-detail {
  font-size: 14px;
  color: var(--ink-dark);
  text-align: center;
  margin-bottom: 8px;
  line-height: 1.6;
}
.result-rewards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.reward-item {
  padding: 4px 12px;
  border-radius: 2px;
  font-size: 13px;
  font-weight: 600;
}
.reward-lingstone {
  background: rgba(201, 168, 76, 0.12);
  color: var(--gold-dark);
  border: 1px solid rgba(201, 168, 76, 0.3);
}
.reward-material {
  background: rgba(107, 142, 107, 0.1);
  color: var(--jade);
  border: 1px solid rgba(107, 142, 107, 0.25);
}

/* 事件卡片 */
.event-text {
  font-size: 15px;
  color: var(--ink-dark);
  line-height: 1.8;
  text-align: center;
  margin-bottom: 16px;
  padding: 8px;
  background: rgba(201, 168, 76, 0.04);
  border-radius: 3px;
}
.event-options {
  display: flex;
  gap: 10px;
}
.event-opt-btn {
  flex: 1;
  padding: 12px;
  font-size: 15px;
}

/* 宝箱卡片 */
.chest-card {
  text-align: center;
}
.chest-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border: 2px solid var(--gold);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 26px;
  color: var(--gold-dark);
  background: rgba(201, 168, 76, 0.08);
  transform: rotate(-2deg);
}
.chest-text {
  font-size: 14px;
  color: var(--ink-light);
  margin-bottom: 16px;
}

/* 休息卡片 */
.rest-card {
  text-align: center;
}
.rest-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border: 2px solid var(--jade);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', cursive;
  font-size: 26px;
  color: var(--jade);
  background: rgba(107, 142, 107, 0.08);
  transform: rotate(-2deg);
}
.rest-text {
  font-size: 14px;
  color: var(--ink-light);
  margin-bottom: 16px;
}

/* 前进/完成按钮 */
.advance-area {
  margin-top: 16px;
  text-align: center;
}
.advance-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  letter-spacing: 2px;
}
.boss-clear-btn {
  background: linear-gradient(135deg, var(--quality-purple), #8f6fba);
  border-color: var(--quality-purple);
  box-shadow: 0 3px 12px rgba(123, 94, 167, 0.3);
}

/* 放弃按钮 */
.abandon-area {
  text-align: center;
  margin-top: 4px;
}
.abandon-btn {
  width: 100%;
  padding: 10px;
  font-size: 13px;
  opacity: 0.7;
}

/* ===== 阶段3：结算 ===== */
.settlement-card {
  margin-bottom: 16px;
}
.settlement-section-title {
  font-size: 15px;
  color: var(--ink-dark);
  letter-spacing: 2px;
  margin-bottom: 10px;
  padding-left: 10px;
  border-left: 3px solid var(--vermillion);
}
.settlement-log {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.log-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: rgba(245, 240, 230, 0.5);
  border-radius: 2px;
  font-size: 13px;
}
.log-index {
  font-size: 11px;
  color: var(--ink-light);
  min-width: 24px;
}
.log-type {
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 11px;
}
.log-type-battle {
  background: rgba(197, 61, 19, 0.08);
  color: var(--vermillion);
}
.log-type-event {
  background: rgba(201, 168, 76, 0.1);
  color: var(--gold-dark);
}
.log-type-chest {
  background: rgba(201, 168, 76, 0.1);
  color: var(--gold-dark);
}
.log-type-rest {
  background: rgba(107, 142, 107, 0.1);
  color: var(--jade);
}
.log-type-boss {
  background: rgba(123, 94, 167, 0.1);
  color: var(--quality-purple);
}
.log-name {
  flex: 1;
  font-weight: 600;
}
.log-reward {
  font-size: 11px;
  color: var(--gold-dark);
}

.total-rewards {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.total-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 16px;
  border-radius: 3px;
  min-width: 80px;
}
.total-lingstone {
  background: rgba(201, 168, 76, 0.08);
  border: 1px solid rgba(201, 168, 76, 0.25);
}
.total-material {
  background: rgba(107, 142, 107, 0.08);
  border: 1px solid rgba(107, 142, 107, 0.25);
}
.total-label {
  font-size: 11px;
  color: var(--ink-light);
}
.total-value {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
}
.total-lingstone .total-value { color: var(--gold-dark); }
.total-material .total-value { color: var(--jade); }
.total-empty {
  font-size: 13px;
  color: var(--ink-light);
  padding: 10px;
}

.settlement-back-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  letter-spacing: 2px;
}

/* 通用结果卡片复用 node-interact */
.battle-result,
.event-result,
.chest-result,
.rest-result {
  text-align: center;
}
</style>
