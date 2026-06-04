import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import buildingsData from '../../data/buildings.json'

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
    gameStarted: false
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
    resourceTick()
  }, 1000)

  // 自动保存
  setInterval(() => {
    saveGame()
  }, 30000)

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
    processOffline
  }
})