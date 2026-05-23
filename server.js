// server.js — Express сервер

const express = require("express");
const cors = require("cors");
const path = require("path");
const { processMessage } = require("./gemini");
const { botState, flushCommands } = require("./botState");

const app = express();
const PORT = 3000;

// === СЕКРЕТНЫЙ КЛЮЧ для Roblox ===
const ROBLOX_SECRET = "222PPPSecret";
const PANEL_PASSWORD = "222PPPSecret";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// ПАНЕЛЬ УПРАВЛЕНИЯ — Веб-интерфейс
// ==========================================

// Авторизация панели
app.post("/api/auth", (req, res) => {
  const { password } = req.body;
  if (password === PANEL_PASSWORD) {
    res.json({ success: true, token: PANEL_PASSWORD });
  } else {
    res.status(401).json({ success: false, error: "Неверный пароль" });
  }
});

// Middleware проверки авторизации
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"];
  if (token !== PANEL_PASSWORD) {
    return res.status(401).json({ error: "Не авторизован" });
  }
  next();
}

// Отправить сообщение AI
app.post("/api/chat", authMiddleware, async (req, res) => {
  const { message } = req.body;

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "Пустое сообщение" });
  }

  console.log(`[PANEL] Сообщение: ${message}`);

  const result = await processMessage(message);

  console.log(`[AI] Ответ: ${result.message}`);
  if (result.executedCommands.length > 0) {
    console.log(`[AI] Команды:`, result.executedCommands);
  }

  res.json(result);
});

// Получить состояние бота
app.get("/api/status", authMiddleware, (req, res) => {
  res.json({
    detectionRadius: botState.detectionRadius,
    speed: botState.speed,
    isChasing: botState.isChasing,
    targetPlayer: botState.targetPlayer,
    pendingCommands: botState.pendingCommands.length,
    gameInfo: botState.gameInfo,
    cooldowns: {
      freeze: Math.max(0, Math.ceil(((botState.cooldowns.freeze || 0) - Date.now()) / 1000))
    }
  });
});

// Получить историю чата
app.get("/api/history", authMiddleware, (req, res) => {
  res.json(botState.chatHistory.slice(-50));
});

// ==========================================
// ROBLOX API — Общение с игрой
// ==========================================

// Middleware для Roblox
function robloxAuth(req, res, next) {
  const secret = req.headers["x-bot-secret"];
  if (secret !== ROBLOX_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// Roblox забирает команды (polling каждые 1-2 секунды)
app.get("/api/roblox/commands", robloxAuth, (req, res) => {
  const commands = flushCommands();
  res.json({
    commands: commands,
    settings: {
      detectionRadius: botState.detectionRadius,
      speed: botState.speed,
      isChasing: botState.isChasing,
      targetPlayer: botState.targetPlayer
    }
  });
});

// Roblox отправляет информацию об игре
app.post("/api/roblox/update", robloxAuth, (req, res) => {
  const { players, keysCollected, botPosition } = req.body;

  if (players) botState.gameInfo.players = players;
  if (keysCollected) botState.gameInfo.keysCollected = keysCollected;
  if (botPosition) botState.gameInfo.botPosition = botPosition;
  botState.gameInfo.lastUpdate = Date.now();

  res.json({ ok: true });
});

// ==========================================
// ЗАПУСК
// ==========================================

app.listen(PORT, () => {
  console.log("═══════════════════════════════════════");
  console.log("  🎮 Horror Bot Server ЗАПУЩЕН");
  console.log(`  📍 Панель: http://localhost:${PORT}`);
  console.log(`  🔑 Roblox API: http://localhost:${PORT}/api/roblox/`);
  console.log("═══════════════════════════════════════");
});