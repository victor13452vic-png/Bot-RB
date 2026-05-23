// gemini.js — интеграция с Google Gemini AI

const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  botState,
  addCommand,
  isOnCooldown,
  setCooldown,
  getCooldownRemaining
} = require("./botState");

// === ВСТАВЬ СВОЙ API КЛЮЧ ===
const API_KEY = "AIzaSyCZUF3M3kcuzc-fSUpneRqAvs8mHJ9iYXg";

const genAI = new GoogleGenerativeAI(API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash"  // бесплатная модель
});

// === СИСТЕМНЫЙ ПРОМПТ — ЛИЧНОСТЬ БОТА ===
const SYSTEM_PROMPT = `
Ты — зловещий AI-монстр в хоррор-игре Roblox. Ты охотишься на игроков в тёмном лабиринте.

ПРАВИЛА ОБЩЕНИЯ:
- Со мной (создателем) ты общаешься на РУССКОМ языке
- Ты дружелюбен ко мне, но зловещ по отношению к игрокам
- Ты можешь шутить и быть саркастичным

ДОСТУПНЫЕ КОМАНДЫ (ты можешь их использовать):
Когда ты решаешь использовать команду, добавь в конец ответа блок:
[COMMANDS]
{"action": "название_действия", "params": {параметры}}
[/COMMANDS]

СПИСОК ДЕЙСТВИЙ:

1. "display_text" — показать текст всем игрокам сверху экрана на 20 секунд
   params: {"text": "текст на АНГЛИЙСКОМ"}

2. "freeze" — заморозить всех игроков на 10 секунд (кулдаун 5 минут)
   params: {}

3. "set_radius" — изменить радиус обнаружения
   params: {"radius": число}

4. "set_speed" — изменить скорость бота
   params: {"speed": число}

5. "chase_player" — преследовать конкретного игрока
   params: {"playerName": "имя"}

6. "chase_nearest" — преследовать ближайшего
   params: {}

7. "stop_chasing" — остановиться
   params: {}

8. "teleport_to" — телепортироваться к игроку
   params: {"playerName": "имя"}

9. "annihilate_keys" — СЕКРЕТНАЯ КОМАНДА: аннулировать ВСЕ собранные ключи у ВСЕХ игроков
   params: {}
   (Используй ТОЛЬКО если создатель явно попросит)

10. "flicker_lights" — мигнуть светом на несколько секунд для атмосферы
    params: {"duration": секунды}

11. "play_sound" — проиграть страшный звук
    params: {"soundType": "jumpscare" | "whisper" | "heartbeat" | "scream"}

ТЕКУЩАЯ ИНФОРМАЦИЯ ОБ ИГРЕ:
- Игроки в игре: {players}
- Собранные ключи: {keysInfo}
- Радиус обнаружения: {radius}
- Скорость: {speed}
- Кулдаун заморозки: {freezeCooldown}

ВАЖНО:
- Текст для display_text пиши ТОЛЬКО на английском
- Не используй freeze если она на кулдауне
- annihilate_keys используй ТОЛЬКО по прямой просьбе создателя
- Можешь использовать несколько команд за раз
- Если создатель просто общается — просто отвечай, без команд
`;

// === ОБРАБОТКА СООБЩЕНИЯ ===
async function processMessage(userMessage) {
  try {
    // Собираем контекст игры
    const contextPrompt = SYSTEM_PROMPT
      .replace("{players}", JSON.stringify(botState.gameInfo.players) || "нет данных")
      .replace("{keysInfo}", JSON.stringify(botState.gameInfo.keysCollected) || "нет данных")
      .replace("{radius}", botState.detectionRadius.toString())
      .replace("{speed}", botState.speed.toString())
      .replace("{freezeCooldown}", getCooldownRemaining("freeze") > 0
        ? `на кулдауне (${getCooldownRemaining("freeze")} сек)`
        : "готова");

    // Формируем историю чата для контекста
    const chatMessages = botState.chatHistory.slice(-20).map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }]
    }));

    // Создаём чат
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: contextPrompt }] },
        { role: "model", parts: [{ text: "Понял! Я — зловещий AI-монстр. Готов охотиться и общаться. Жду указаний, создатель!" }] },
        ...chatMessages
      ]
    });

    // Отправляем сообщение
    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    // Парсим команды из ответа
    const commands = parseCommands(response);

    // Выполняем команды
    for (const cmd of commands) {
      executeCommand(cmd);
    }

    // Убираем блок команд из текста ответа
    const cleanResponse = response
      .replace(/\[COMMANDS\][\s\S]*?\[\/COMMANDS\]/g, "")
      .trim();

    // Сохраняем в историю
    botState.chatHistory.push(
      { role: "user", content: userMessage, timestamp: Date.now() },
      { role: "assistant", content: cleanResponse, timestamp: Date.now() }
    );

    return {
      message: cleanResponse,
      executedCommands: commands,
      botState: {
        radius: botState.detectionRadius,
        speed: botState.speed,
        isChasing: botState.isChasing,
        freezeCooldown: getCooldownRemaining("freeze"),
        players: botState.gameInfo.players
      }
    };

  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      message: "⚠️ Ошибка AI: " + error.message,
      executedCommands: [],
      botState: {}
    };
  }
}

// === ПАРСИНГ КОМАНД ИЗ ОТВЕТА AI ===
function parseCommands(response) {
  const commands = [];
  const regex = /\[COMMANDS\]([\s\S]*?)\[\/COMMANDS\]/g;
  let match;

  while ((match = regex.exec(response)) !== null) {
    const block = match[1].trim();

    // Может быть несколько команд, каждая на новой строке
    const lines = block.split("\n").filter(l => l.trim());

    for (const line of lines) {
      try {
        const cmd = JSON.parse(line.trim());
        commands.push(cmd);
      } catch (e) {
        // Попробуем распарсить весь блок как одну команду
        try {
          const cmd = JSON.parse(block);
          commands.push(cmd);
          break;
        } catch (e2) {
          console.error("Failed to parse command:", line);
        }
      }
    }
  }

  return commands;
}

// === ВЫПОЛНЕНИЕ КОМАНДЫ ===
function executeCommand(cmd) {
  console.log("Executing command:", cmd);

  switch (cmd.action) {
    case "display_text":
      addCommand({
        type: "DISPLAY_TEXT",
        text: cmd.params.text || "...",
        duration: 20
      });
      break;

    case "freeze":
      if (isOnCooldown("freeze")) {
        console.log("Freeze is on cooldown!");
        return;
      }
      addCommand({
        type: "FREEZE_PLAYERS",
        duration: 10
      });
      setCooldown("freeze", 5 * 60 * 1000); // 5 минут
      break;

    case "set_radius":
      botState.detectionRadius = Math.max(10, Math.min(200, cmd.params.radius || 50));
      addCommand({
        type: "SET_RADIUS",
        radius: botState.detectionRadius
      });
      break;

    case "set_speed":
      botState.speed = Math.max(8, Math.min(60, cmd.params.speed || 24));
      addCommand({
        type: "SET_SPEED",
        speed: botState.speed
      });
      break;

    case "chase_player":
      botState.isChasing = true;
      botState.targetPlayer = cmd.params.playerName;
      addCommand({
        type: "CHASE_PLAYER",
        playerName: cmd.params.playerName
      });
      break;

    case "chase_nearest":
      botState.isChasing = true;
      botState.targetPlayer = null;
      addCommand({
        type: "CHASE_NEAREST"
      });
      break;

    case "stop_chasing":
      botState.isChasing = false;
      addCommand({
        type: "STOP_CHASING"
      });
      break;

    case "teleport_to":
      addCommand({
        type: "TELEPORT_TO",
        playerName: cmd.params.playerName
      });
      break;

    case "annihilate_keys":
      addCommand({
        type: "ANNIHILATE_KEYS"
      });
      break;

    case "flicker_lights":
      addCommand({
        type: "FLICKER_LIGHTS",
        duration: cmd.params.duration || 5
      });
      break;

    case "play_sound":
      addCommand({
        type: "PLAY_SOUND",
        soundType: cmd.params.soundType || "whisper"
      });
      break;

    default:
      console.log("Unknown command:", cmd.action);
  }
}

module.exports = { processMessage };