// script.js — логика панели управления

let authToken = "";
let isLoading = false;

// === АВТОРИЗАЦИЯ ===
async function login() {
  const password = document.getElementById("passwordInput").value;

  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (data.success) {
      authToken = data.token;
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("mainPanel").style.display = "flex";
      loadHistory();
      startStatusPolling();
    } else {
      document.getElementById("loginError").textContent = "Неверный пароль!";
    }
  } catch (e) {
    document.getElementById("loginError").textContent = "Ошибка сервера";
  }
}

// === ОТПРАВКА СООБЩЕНИЯ ===
async function sendMessage() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();

  if (!message || isLoading) return;

  input.value = "";
  isLoading = true;
  document.getElementById("sendBtn").disabled = true;

  // Показываем сообщение пользователя
  addMessageToChat("user", message);

  // Показываем индикатор "печатает"
  const typingId = showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken
      },
      body: JSON.stringify({ message })
    });

    const data = await res.json();

    // Убираем индикатор
    removeTyping(typingId);

    // Показываем ответ бота
    addMessageToChat("bot", data.message, data.executedCommands);

    // Обновляем статус
    if (data.botState) {
      updateStatusBar(data.botState);
    }

  } catch (e) {
    removeTyping(typingId);
    addMessageToChat("bot", "⚠️ Ошибка соединения с сервером");
  }

  isLoading = false;
  document.getElementById("sendBtn").disabled = false;
  input.focus();
}

// === БЫСТРАЯ КОМАНДА ===
function quickCommand(text) {
  document.getElementById("chatInput").value = text;
  sendMessage();
}

// === ДОБАВИТЬ СООБЩЕНИЕ В ЧАТ ===
function addMessageToChat(type, text, commands = []) {
  const container = document.getElementById("chatMessages");

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type === "user" ? "user-message" : "bot-message"}`;

  let commandsHtml = "";
  if (commands && commands.length > 0) {
    commandsHtml = `
      <div class="message-commands">
        ⚡ Выполнено: ${commands.map(c => c.action).join(", ")}
      </div>
    `;
  }

  messageDiv.innerHTML = `
    <div class="message-avatar">${type === "user" ? "👤" : "🤖"}</div>
    <div class="message-content">
      <p>${escapeHtml(text)}</p>
      ${commandsHtml}
    </div>
  `;

  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

// === ИНДИКАТОР ПЕЧАТАНИЯ ===
function showTyping() {
  const container = document.getElementById("chatMessages");
  const id = "typing_" + Date.now();

  const div = document.createElement("div");
  div.id = id;
  div.className = "message bot-message";
  div.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <p style="color:#888">Думаю...</p>
    </div>
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// === ЗАГРУЗКА ИСТОРИИ ===
async function loadHistory() {
  try {
    const res = await fetch("/api/history", {
      headers: { "Authorization": authToken }
    });

    const history = await res.json();

    for (const msg of history) {
      addMessageToChat(
        msg.role === "user" ? "user" : "bot",
        msg.content
      );
    }
  } catch (e) {
    console.error("Failed to load history");
  }
}

// === POLLING СТАТУСА ===
function startStatusPolling() {
  updateStatus();
  setInterval(updateStatus, 3000);
}

async function updateStatus() {
  try {
    const res = await fetch("/api/status", {
      headers: { "Authorization": authToken }
    });

    const data = await res.json();
    updateStatusBar(data);
    updatePlayersPanel(data);
    updateKeysPanel(data);

  } catch (e) {
    // ignore
  }
}

function updateStatusBar(data) {
  if (data.players) {
    document.getElementById("statusPlayers").textContent =
      `👥 Игроки: ${Array.isArray(data.players) ? data.players.length : 0}`;
  }
  if (data.radius || data.detectionRadius) {
    document.getElementById("statusRadius").textContent =
      `📡 Радиус: ${data.radius || data.detectionRadius}`;
  }
  if (data.speed) {
    document.getElementById("statusSpeed").textContent =
      `⚡ Скорость: ${data.speed}`;
  }
  const freezeCd = data.freezeCooldown || (data.cooldowns && data.cooldowns.freeze) || 0;
  document.getElementById("statusFreeze").textContent =
    freezeCd > 0 ? `❄️ КД: ${freezeCd}с` : `❄️ Готова`;
}

function updatePlayersPanel(data) {
  const container = document.getElementById("playersList");
  const players = data.gameInfo ? data.gameInfo.players : data.players;

  if (!players || players.length === 0) {
    container.innerHTML = '<p class="no-data">Нет игроков</p>';
    return;
  }

  container.innerHTML = players.map(p => `
    <div class="player-item">
      <span>👤 ${typeof p === 'string' ? p : p.name || p}</span>
      <button onclick="quickCommand('Преследуй игрока ${typeof p === 'string' ? p : p.name || p}')"
              style="background:none;border:1px solid #444;color:#aaa;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px">
        🎯
      </button>
    </div>
  `).join("");
}

function updateKeysPanel(data) {
  const container = document.getElementById("keysInfo");
  const keys = data.gameInfo ? data.gameInfo.keysCollected : null;

  if (!keys || Object.keys(keys).length === 0) {
    container.innerHTML = '<p class="no-data">Нет данных о ключах</p>';
    return;
  }

  container.innerHTML = Object.entries(keys).map(([player, count]) => `
    <div class="player-item">
      <span>👤 ${player}</span>
      <span>🔑 ${count}/5</span>
    </div>
  `).join("");
}

// === УТИЛИТЫ ===
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}