// botState.js — хранит текущее состояние бота и очередь команд

const botState = {
  // === ОСНОВНЫЕ ПАРАМЕТРЫ ===
  detectionRadius: 50,       // радиус обнаружения игроков
  speed: 24,                 // скорость бота
  isChasing: true,           // гоняется ли за игроками
  targetPlayer: null,        // конкретная цель (null = ближайший)

  // === ОЧЕРЕДЬ КОМАНД ДЛЯ ROBLOX ===
  pendingCommands: [],

  // === КУЛДАУНЫ ===
  cooldowns: {
    freeze: 0,               // timestamp когда freeze снова доступен
    annihilateKeys: 0        // timestamp когда аннулирование ключей доступно
  },

  // === ИСТОРИЯ ЧАТА ===
  chatHistory: [],

  // === ИНФОРМАЦИЯ ОТ ROBLOX ===
  gameInfo: {
    players: [],
    keysCollected: {},       // { playerName: numberOfKeys }
    botPosition: { x: 0, y: 0, z: 0 },
    lastUpdate: 0
  }
};

// Добавить команду в очередь
function addCommand(command) {
  botState.pendingCommands.push({
    ...command,
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: Date.now()
  });
}

// Забрать все команды (Roblox их заберёт через polling)
function flushCommands() {
  const commands = [...botState.pendingCommands];
  botState.pendingCommands = [];
  return commands;
}

// Проверить кулдаун
function isOnCooldown(ability) {
  return Date.now() < (botState.cooldowns[ability] || 0);
}

// Установить кулдаун
function setCooldown(ability, durationMs) {
  botState.cooldowns[ability] = Date.now() + durationMs;
}

// Получить оставшееся время кулдауна
function getCooldownRemaining(ability) {
  const remaining = (botState.cooldowns[ability] || 0) - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

module.exports = {
  botState,
  addCommand,
  flushCommands,
  isOnCooldown,
  setCooldown,
  getCooldownRemaining
};