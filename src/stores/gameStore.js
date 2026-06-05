import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import buildingsData from '../../data/buildings.json'
import dungeonsData from '../../data/dungeons.json'
import disciplesMeta from '../../data/disciples.json'
import realmsMeta from '../../data/realms.json'

const SAVE_KEY = 'zongmen_save_v1'

function createInitialState() {
  return {
    // 宗门基本信息
    clanName: '太虚宗',
    clanLevel: 1,
    reputation: 0,

    // 资源
    lingstone: 500,
    qi: 0,
    materials: {
      '矿石': 0,
      '灵草': 0,
      '功法残卷': 0,
      '招贤令': 0
    },

    // 体力
    stamina: 100,
    maxStamina: 100,

    // 建筑
    buildings: {
      main_hall: { level: 1, upgrading: false, upgrade_end: 0 },
      training_room: { level: 0, upgrading: false, upgrade_end: 0 },
      warehouse: { level: 1, upgrading: false, upgrade_end: 0 },
      library: { level: 0, upgrading: false, upgrade_end: 0 },
      alchemy_room: { level: 0, upgrading: false, upgrade_end: 0 },
      forge: { level: 0, upgrading: false, upgrade_end: 0 },
      guard_array: { level: 0, upgrading: false, upgrade_end: 0 },
      arena: { level: 0, upgrading: false, upgrade_end: 0 }
    },

    // 弟子
    disciples: [],

    // 日志
    logs: [],

    // 离线
    lastSaveTime: Date.now(),

    // 游戏开始时间
    gameStarted: false,

    // 秘境探索
    currentDungeon: null,
    dungeonNodes: [],
    currentNodeIndex: -1,
    exploring: false,
    explorationLog: [],

    // 弟子系统
    discipleIdCounter: 0,
    freeRefreshUsed: false,
    freeRefreshDate: ''
  }
}

export const useGameStore = defineStore('game', () => {
  const state = ref(createInitialState())

  const discipleMax = computed(() => {
    const hallLevel = state.value.buildings.main_hall.level
    const caps = [0, 5, 8, 12, 16, 20, 25, 30, 35, 40, 50]
    return caps[hallLevel] || 5
  })

  const storageLimit = computed(() => {
    const whLevel = state.value.buildings.warehouse.level
    if (whLevel === 0) return 500
    const limits = [0, 1000, 3000, 8000, 20000, 50000, 120000, 300000, 800000, 2000000, 5000000]
    return limits[whLevel] || 500
  })

  const cultivateSpeed = computed(() => {
    const trLevel = state.value.buildings.training_room.level
    if (trLevel === 0) return 0.5
    const speeds = [0, 1.0, 1.2, 1.5, 1.8, 2.2, 2.6, 3.0, 3.5, 4.0, 5.0]
    return speeds[trLevel] || 0.5
  })

  function addLog(type, text) {
    state.value.logs.unshift({
      id: Date.now(),
      time: new Date().toLocaleString('zh-CN'),
      type,
      text
    })
    if (state.value.logs.length > 200) {
      state.value.logs = state.value.logs.slice(0, 200)
    }
  }

  function addMaterial(name, amount) {
    if (!state.value.materials[name]) {
      state.value.materials[name] = 0
    }
    state.value.materials[name] += amount
  }

  function removeMaterial(name, amount) {
    if (!state.value.materials[name] || state.value.materials[name] < amount) return false
    state.value.materials[name] -= amount
    return true
  }

  function addLingstone(amount) {
    state.value.lingstone += amount
  }

  function spendLingstone(amount) {
    if (state.value.lingstone < amount) return false
    state.value.lingstone -= amount
    return true
  }

  function canAfford(cost) {
    if (cost.lingstone && state.value.lingstone < cost.lingstone) return false
    if (cost.materials) {
      for (const [mat, amt] of Object.entries(cost.materials)) {
        if (!state.value.materials[mat] || state.value.materials[mat] < amt) return false
      }
    }
    return true
  }

  function payCost(cost) {
    if (cost.lingstone) state.value.lingstone -= cost.lingstone
    if (cost.materials) {
      for (const [mat, amt] of Object.entries(cost.materials)) {
        state.value.materials[mat] -= amt
      }
    }
  }

  function saveGame() {
    state.value.lastSaveTime = Date.now()
    const data = JSON.parse(JSON.stringify(state.value))
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      try {
        const data = JSON.parse(raw)
        state.value = data
        return true
      } catch (e) {
        console.error('存档损坏', e)
        return false
      }
    }
    return false
  }

  function resetGame() {
    state.value = createInitialState()
    localStorage.removeItem(SAVE_KEY)
  }

  function hasSave() {
    return !!localStorage.getItem(SAVE_KEY)
  }

  // ===== 建筑系统 =====

  function getBuildingData(buildingId) {
    return buildingsData.buildings.find(b => b.id === buildingId)
  }

  function getBuildingState(buildingId) {
    return state.value.buildings[buildingId]
  }

  function isBuildingUnlocked(buildingId) {
    const data = getBuildingData(buildingId)
    if (!data || !data.unlock) return true
    const cond = data.unlock
    const condBuilding = getBuildingState(cond.building)
    return condBuilding && condBuilding.level >= cond.level
  }

  function getBuildingUpgradeData(buildingId) {
    const data = getBuildingData(buildingId)
    const state = getBuildingState(buildingId)
    if (!data || state.level >= data.max_level) return null
    return data.levels[state.level] // next level
  }

  function startUpgrade(buildingId) {
    const data = getBuildingUpgradeData(buildingId)
    if (!data) return { success: false, reason: '已满级' }
    if (!canAfford({ lingstone: data.lingstone, materials: data.materials })) {
      return { success: false, reason: '资源不足' }
    }
    const building = getBuildingState(buildingId)
    payCost({ lingstone: data.lingstone, materials: data.materials })
    building.upgrading = true
    building.upgrade_end = Date.now() + data.time_sec * 1000
    const bd = getBuildingData(buildingId)
    addLog('build', `${bd.name}开始升级至 ${building.level + 1} 级`)
    saveGame()
    return { success: true }
  }

  function checkAndCompleteUpgrades() {
    const now = Date.now()
    let changed = false
    for (const [id, bState] of Object.entries(state.value.buildings)) {
      if (bState.upgrading && now >= bState.upgrade_end) {
        bState.level++
        bState.upgrading = false
        bState.upgrade_end = 0
        changed = true
        const bd = getBuildingData(id)
        addLog('build', `${bd.name}升级完成！当前等级 ${bState.level}`)
      }
    }
    if (changed) saveGame()
  }

  function getUpgradeRemaining(buildingId) {
    const state = getBuildingState(buildingId)
    if (!state || !state.upgrading) return 0
    return Math.max(0, Math.ceil((state.upgrade_end - Date.now()) / 1000))
  }

  // ===== 资源产出 =====

  function getLingstonePerHour() {
    const hallLevel = state.value.buildings.main_hall.level
    return 30 * hallLevel * hallLevel
  }

  function getQiPerHour() {
    const trLevel = state.value.buildings.training_room.level
    if (trLevel === 0) return 0
    return 20 * trLevel
  }

  function getStaminaPerHour() {
    return 30
  }

  function processOffline() {
    const now = Date.now()
    const elapsed = (now - state.value.lastSaveTime) / 1000
    const cappedElapsed = Math.min(elapsed, 8 * 3600)
    if (cappedElapsed < 10) return

    const hours = cappedElapsed / 3600

    const lingstoneGain = Math.floor(getLingstonePerHour() * hours)
    const qiGain = Math.floor(getQiPerHour() * hours)
    const staminaGain = Math.floor(getStaminaPerHour() * hours)

    state.value.lingstone += lingstoneGain
    state.value.qi += qiGain
    state.value.stamina = Math.min(state.value.maxStamina, state.value.stamina + staminaGain)

    addLog('offline', `离线 ${Math.floor(cappedElapsed / 60)} 分钟，获得灵石 +${lingstoneGain}，灵气 +${qiGain}`)
    state.value.lastSaveTime = now
    saveGame()
  }

  // 在线资源 tick
  let lastTick = Date.now()
  function resourceTick() {
    const now = Date.now()
    const dt = (now - lastTick) / 1000
    lastTick = now
    if (dt <= 0) return

    state.value.lingstone += (getLingstonePerHour() / 3600) * dt
    state.value.qi += (getQiPerHour() / 3600) * dt
    state.value.stamina = Math.min(state.value.maxStamina, state.value.stamina + (getStaminaPerHour() / 3600) * dt)
  }

  setInterval(() => {
    checkAndCompleteUpgrades()
    checkCultivation()
    resourceTick()
  }, 1000)

  // 自动保存
  setInterval(() => {
    saveGame()
  }, 30000)

  // ===== 弟子系统 =====

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  function shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function generateRandomDisciple() {
    const surname = pickRandom(disciplesMeta.names.surnames)
    const given = pickRandom(disciplesMeta.names.given_names)
    const name = surname + given

    // 品质加权随机
    const r = Math.random() * 100
    let quality = 'common'
    let acc = 0
    for (const q of disciplesMeta.qualities) {
      acc += q.weight
      if (r <= acc) { quality = q.id; break }
    }

    // 天赋随机
    const qData = disciplesMeta.qualities.find(q => q.id === quality)
    const talentCount = qData ? randomInt(qData.talent_min, qData.talent_max) : 0
    const shuffledTalents = shuffle(disciplesMeta.talents)
    const talents = shuffledTalents.slice(0, talentCount)

    return {
      id: '',
      name,
      quality,
      realm: { id: 'zhuji', name: '筑基', order: 1, sub_idx: 0, sub_name: '初期' },
      talents,
      base_stats: {
        atk: randomInt(50, 150),
        def: randomInt(30, 100),
        hp: randomInt(200, 500)
      },
      cultivate_until: 0,
      recruited_at: Date.now()
    }
  }

  function generateRecruitPool(count = 3) {
    const today = new Date().toISOString().slice(0, 10)
    if (today !== state.value.freeRefreshDate) {
      state.value.freeRefreshUsed = false
      state.value.freeRefreshDate = today
    }
    const pool = []
    for (let i = 0; i < count; i++) {
      pool.push(generateRandomDisciple())
    }
    return pool
  }

  function recruitDisciple(disciple, useToken = false) {
    if (!useToken) {
      if (state.value.freeRefreshUsed) return { success: false, reason: '今日免费招募已使用' }
      state.value.freeRefreshUsed = true
    } else {
      if (!state.value.materials['招贤令'] || state.value.materials['招贤令'] < 1) {
        return { success: false, reason: '招贤令不足' }
      }
      state.value.materials['招贤令'] -= 1
    }

    const cap = discipleMax.value
    if (state.value.disciples.length >= cap) {
      return { success: false, reason: `弟子已满（上限${cap}人）` }
    }

    state.value.discipleIdCounter++
    disciple.id = 'd_' + state.value.discipleIdCounter
    state.value.disciples.push({ ...disciple })
    const qName = getQualityName(disciple.quality)
    addLog('disciple', `招募新弟子【${disciple.name}】(${qName})`)
    saveGame()
    return { success: true }
  }

  function getQualityName(quality) {
    const q = disciplesMeta.qualities.find(q => q.id === quality)
    return q ? q.name : '凡品'
  }

  function startCultivate(discipleId) {
    const d = state.value.disciples.find(x => x.id === discipleId)
    if (!d) return { success: false, reason: '弟子不存在' }
    if (d.cultivate_until > Date.now()) return { success: false, reason: '已在修炼中' }

    const baseSeconds = d.realm.order * 3600
    let bonus = 1
    // 天赋加速
    for (const t of d.talents) {
      if (t.effect.cultivate_bonus) bonus += t.effect.cultivate_bonus
    }
    const duration = Math.round(baseSeconds / (cultivateSpeed.value * bonus))
    d.cultivate_until = Date.now() + duration * 1000
    addLog('disciple', `${d.name}开始修炼，预计${formatDurationText(duration)}`)
    saveGame()
    return { success: true, duration }
  }

  function cancelCultivate(discipleId) {
    const d = state.value.disciples.find(x => x.id === discipleId)
    if (!d) return { success: false, reason: '弟子不存在' }
    const done = d.cultivate_until > 0 && d.cultivate_until <= Date.now()
    d.cultivate_until = 0
    if (done) {
      const result = advanceCultivation(d)
      if (result.changed) {
        addLog('disciple', `${d.name}修炼完成，晋升至${d.realm.name}·${d.realm.sub_name}`)
      } else {
        addLog('disciple', `${d.name}修炼完成`)
      }
    }
    saveGame()
    return { success: true, done }
  }

  function advanceCultivation(d) {
    const realmOrder = d.realm.order
    const realmInfo = realmsMeta.realms.find(r => r.order === realmOrder)
    if (!realmInfo) return { changed: false }

    if (d.realm.sub_idx < 3) {
      d.realm.sub_idx++
      d.realm.sub_name = realmInfo.sub_stages[d.realm.sub_idx]
      return { changed: true }
    }
    return { changed: false }
  }

  function checkCultivation() {
    const now = Date.now()
    let changed = false
    for (const d of state.value.disciples) {
      if (d.cultivate_until > 0 && d.cultivate_until <= now) {
        const result = advanceCultivation(d)
        if (result.changed) {
          addLog('disciple', `${d.name}修炼完成，晋升至${d.realm.name}·${d.realm.sub_name}`)
          changed = true
        }
      }
    }
    if (changed) saveGame()
  }

  function tryBreakthrough(discipleId) {
    const d = state.value.disciples.find(x => x.id === discipleId)
    if (!d) return { success: false, reason: '弟子不存在' }
    if (d.realm.sub_idx < 3) return { success: false, reason: '需修炼至圆满方可突破' }

    // 检查品质上限
    const qData = disciplesMeta.qualities.find(q => q.id === d.quality)
    const maxRealm = qData ? qData.max_realm : 'yuanying'
    const nextOrder = d.realm.order + 1
    const nextRealm = realmsMeta.realms.find(r => r.order === nextOrder)
    if (!nextRealm) return { success: false, reason: '已达最高境界' }

    const maxRealmOrder = realmsMeta.realms.find(r => r.id === maxRealm)?.order || 3
    if (nextOrder > maxRealmOrder) {
      return { success: false, reason: `已达${getQualityName(d.quality)}弟子上限（${realmsMeta.realms.find(r=>r.order===maxRealmOrder)?.name}）` }
    }

    // 检查灵石
    const cost = nextRealm.breakthrough_cost
    if (state.value.lingstone < cost) return { success: false, reason: `灵石不足（需要${cost}）` }

    state.value.lingstone -= cost

    // 成功率
    let rate = 0.5
    for (const t of d.talents) {
      if (t.effect.breakthrough_bonus) rate += t.effect.breakthrough_bonus
    }
    rate = Math.min(rate, 0.9)

    const success = Math.random() < rate
    if (success) {
      d.realm = { id: nextRealm.id, name: nextRealm.name, order: nextRealm.order, sub_idx: 0, sub_name: '初期' }
      addLog('disciple', `${d.name}突破成功！晋升至${nextRealm.name}·初期`)
    } else {
      addLog('disciple', `${d.name}突破失败`)
    }
    saveGame()
    return { success: true, breakthrough: success, newRealm: success ? d.realm : null }
  }

  function getCultureRemaining(discipleId) {
    const d = state.value.disciples.find(x => x.id === discipleId)
    if (!d || d.cultivate_until <= 0) return 0
    return Math.max(0, Math.ceil((d.cultivate_until - Date.now()) / 1000))
  }

  function getCultureDuration(discipleId) {
    const d = state.value.disciples.find(x => x.id === discipleId)
    if (!d) return 0
    const baseSeconds = d.realm.order * 3600
    let bonus = 1
    for (const t of d.talents) {
      if (t.effect.cultivate_bonus) bonus += t.effect.cultivate_bonus
    }
    return Math.round(baseSeconds / (cultivateSpeed.value * bonus))
  }

  function formatDurationText(sec) {
    if (sec >= 3600) return Math.floor(sec / 3600) + '时' + Math.round((sec % 3600) / 60) + '分'
    if (sec >= 60) return Math.floor(sec / 60) + '分' + (sec % 60) + '秒'
    return sec + '秒'
  }

  // ===== 秘境探索系统 =====

  function generateNodeChain(nodeCount, dungeon) {
    const nodes = []
    const types = ['battle', 'event', 'chest', 'rest']
    const weights = [40, 25, 15, 15]
    const totalWeight = weights.reduce((a, b) => a + b, 0)

    for (let i = 0; i < nodeCount - 1; i++) {
      let r = Math.random() * totalWeight
      let type = 'battle'
      let acc = 0
      for (let j = 0; j < types.length; j++) {
        acc += weights[j]
        if (r <= acc) { type = types[j]; break }
      }

      let data = null
      switch (type) {
        case 'battle':
          data = { ...dungeon.enemies[Math.floor(Math.random() * dungeon.enemies.length)] }
          break
        case 'event':
          data = { ...dungeon.events[Math.floor(Math.random() * dungeon.events.length)] }
          break
        case 'chest':
        case 'rest':
          data = { type }
          break
      }

      nodes.push({ type, data, cleared: false, index: i })
    }

    nodes.push({ type: 'boss', data: { ...dungeon.boss }, cleared: false, index: nodeCount - 1 })
    return nodes
  }

  function startExplore(dungeonId) {
    if (state.value.stamina < 20) return { success: false, reason: '体力不足，需要20点体力' }

    const dungeon = dungeonsData.dungeons.find(d => d.id === dungeonId)
    if (!dungeon) return { success: false, reason: '副本不存在' }
    if (state.value.clanLevel < dungeon.unlock_level) {
      return { success: false, reason: `需要宗门等级 ${dungeon.unlock_level}` }
    }

    state.value.stamina -= 20

    const [min, max] = dungeon.node_count
    const nodeCount = min + Math.floor(Math.random() * (max - min + 1))

    state.value.dungeonNodes = generateNodeChain(nodeCount, dungeon)
    state.value.currentDungeon = dungeon
    state.value.currentNodeIndex = 0
    state.value.exploring = true
    state.value.explorationLog = []

    addLog('explore', `开始探索【${dungeon.name}】，共 ${nodeCount} 个节点`)
    saveGame()
    return { success: true, nodeCount }
  }

  function nextNode() {
    if (!state.value.exploring) return null
    if (state.value.currentNodeIndex >= state.value.dungeonNodes.length - 1) return null
    state.value.currentNodeIndex++
    saveGame()
    return state.value.dungeonNodes[state.value.currentNodeIndex]
  }

  function clearNode(reward) {
    const node = state.value.dungeonNodes[state.value.currentNodeIndex]
    if (!node || node.cleared) return

    node.cleared = true

    if (reward) {
      if (reward.lingstone && reward.lingstone > 0) {
        state.value.lingstone += Math.floor(reward.lingstone)
      }
      if (reward.materials) {
        for (const [mat, amt] of Object.entries(reward.materials)) {
          addMaterial(mat, amt)
        }
      }
    }

    state.value.explorationLog.push({
      nodeIndex: state.value.currentNodeIndex,
      type: node.type,
      name: node.type === 'battle' || node.type === 'boss' ? node.data.name : node.type,
      reward
    })

    saveGame()
  }

  function finishExplore() {
    const dungeon = state.value.currentDungeon
    const logEntries = [...state.value.explorationLog]

    let totalLingstone = 0
    const totalMaterials = {}
    for (const entry of logEntries) {
      if (entry.reward) {
        if (entry.reward.lingstone) totalLingstone += entry.reward.lingstone
        if (entry.reward.materials) {
          for (const [mat, amt] of Object.entries(entry.reward.materials)) {
            totalMaterials[mat] = (totalMaterials[mat] || 0) + amt
          }
        }
      }
    }

    state.value.currentDungeon = null
    state.value.dungeonNodes = []
    state.value.currentNodeIndex = -1
    state.value.exploring = false
    state.value.explorationLog = []

    if (dungeon) {
      addLog('explore', `完成【${dungeon.name}】探索，获得灵石 +${totalLingstone}`)
    }
    saveGame()

    return { totalLingstone, totalMaterials, log: logEntries }
  }

  function abandonExplore() {
    const dungeon = state.value.currentDungeon
    state.value.currentDungeon = null
    state.value.dungeonNodes = []
    state.value.currentNodeIndex = -1
    state.value.exploring = false
    state.value.explorationLog = []
    if (dungeon) {
      addLog('explore', `放弃探索【${dungeon.name}】`)
    }
    saveGame()
  }

  return {
    state,
    discipleMax,
    storageLimit,
    cultivateSpeed,
    addLog,
    addMaterial,
    removeMaterial,
    addLingstone,
    spendLingstone,
    canAfford,
    payCost,
    saveGame,
    loadGame,
    resetGame,
    hasSave,
    getBuildingData,
    getBuildingState,
    isBuildingUnlocked,
    getBuildingUpgradeData,
    startUpgrade,
    checkAndCompleteUpgrades,
    getUpgradeRemaining,
    getLingstonePerHour,
    getQiPerHour,
    getStaminaPerHour,
    processOffline,
    startExplore,
    nextNode,
    clearNode,
    finishExplore,
    abandonExplore,
    generateRecruitPool,
    recruitDisciple,
    getQualityName,
    startCultivate,
    cancelCultivate,
    checkCultivation,
    tryBreakthrough,
    getCultureRemaining,
    getCultureDuration,
    formatDurationText,
    generateNodeChain
  }
})