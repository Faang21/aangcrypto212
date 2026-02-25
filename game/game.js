/**
 * game.js – PixelCrypto main game logic
 *
 * Features:
 *  • Pixel world with movable player character (WASD / arrow keys)
 *  • Click on another player's character → open private chat
 *  • Click on player name in online list → open private chat
 *  • Character nickname system linked to wallet address
 *  • Vending machine food purchase (on-chain)
 *  • House marketplace: buy from contract, sell back, player-to-player listings
 *  • Skill NFT viewer / purchase
 */

"use strict";

// ─── Constants ───────────────────────────────────────────────────────────────
const TILE = 32;
const PLAYER_SPEED = 3;
const CANVAS_W = 800;
const CANVAS_H = 500;

const COLORS = {
  grass:   "#2d6a4f",
  path:    "#a98467",
  water:   "#48cae4",
  tree:    "#1b4332",
  house:   "#6d4c41",
  houseRoof: "#e94560",
  vending: "#ffd166",
  shadow:  "rgba(0,0,0,0.25)",
};

const FOOD_ICONS = ["🍎","🍞","🧪","✨"];
const HOUSE_ICONS = ["🛖","🏠","🏰"];
const SKILL_ICONS = ["⚔️","🔮","🏹"];

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  wallet: null,
  signer: null,
  provider: null,
  nickname: "",

  contracts: {
    registry: null,
    skillNFT:  null,
    houseNFT:  null,
    vending:   null,
  },

  // Local player
  player: {
    x: CANVAS_W / 2,
    y: CANVAS_H / 2,
    color: "#e94560",
    dir: "down",
    frame: 0,
    moving: false,
  },

  // Other online players (simulated locally; in production use WebSocket)
  otherPlayers: [],

  keys: {},
  animTick: 0,

  // Private message target
  pmTarget: null, // { wallet, nickname }

  // Chat messages (global & PM)
  globalMessages: [],
  pmMessagesMap: {}, // wallet => Message[]

  // Cached chain data
  houseTypes: [],
  foodItems: [],
  skillTypes: [],
  myHouseTokenIds: [],

  // City system
  currentCity: 1, // 1 = Modern City, 2 = Coastal Paradise

  // City 2: animated objects
  train: {
    progress: 0,       // 0..1 position along oval track
    speed: 0.0006,
    onBoard: false,
    nearStation: -1,   // index in TRAIN_STATIONS, -1 = none
  },
  airplane: {
    x: -150,
    y: 68,
    speed: 0.85,
  },
  taxi: {
    x: 130,
    y: 290,
    dir: 1,            // 1 = right, -1 = left
    speed: 1.1,
    onBoard: false,
    nearPlayer: false,
  },
  jobs: {
    current: null,     // 'pilot' | 'masinis' | 'lifeguard' | 'taxi' | null
  },
  city2Bots: null,   // initialized lazily when city 2 first loads
};

// ─── Utils ────────────────────────────────────────────────────────────────────
function shortAddr(addr) {
  if (!addr) return "?";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function displayName(wallet) {
  const p = state.otherPlayers.find(p => p.wallet?.toLowerCase() === wallet?.toLowerCase());
  if (p?.nickname) return p.nickname;
  return shortAddr(wallet);
}

let toastTimer = null;
function showToast(msg, duration = 3000) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), duration);
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

function fmtEth(wei) {
  if (!wei) return "0 ETH";
  return ethers.utils.formatEther(wei) + " ETH";
}

// ─── Wallet & Contracts ───────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) {
    showToast("MetaMask not found. Please install MetaMask.");
    return;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    state.provider = new ethers.providers.Web3Provider(window.ethereum);
    state.signer   = state.provider.getSigner();
    state.wallet   = await state.signer.getAddress();

    document.getElementById("btn-connect").classList.add("hidden");
    document.getElementById("wallet-display").textContent = shortAddr(state.wallet);
    document.getElementById("wallet-display").classList.remove("hidden");
    document.getElementById("btn-set-nickname").classList.remove("hidden");

    initContracts();
    await loadNickname();
    await refreshOnlinePlayers();
    showToast("Wallet connected: " + shortAddr(state.wallet));
  } catch (err) {
    showToast("Connection failed: " + err.message);
  }
}

function initContracts() {
  const addrs = window.CONTRACT_ADDRESSES;
  if (addrs.playerRegistry) {
    state.contracts.registry = new ethers.Contract(addrs.playerRegistry, window.ABI_PLAYER_REGISTRY, state.signer);
  }
  if (addrs.skillNFT) {
    state.contracts.skillNFT = new ethers.Contract(addrs.skillNFT, window.ABI_SKILL_NFT, state.signer);
  }
  if (addrs.houseNFT) {
    state.contracts.houseNFT = new ethers.Contract(addrs.houseNFT, window.ABI_HOUSE_NFT, state.signer);
  }
  if (addrs.vendingMachine) {
    state.contracts.vending = new ethers.Contract(addrs.vendingMachine, window.ABI_VENDING, state.signer);
  }
}

async function loadNickname() {
  if (!state.contracts.registry) return;
  try {
    const nn = await state.contracts.registry.getNickname(state.wallet);
    if (nn) {
      state.nickname = nn;
      const el = document.getElementById("nickname-display");
      el.textContent = "🧑 " + nn;
      el.classList.remove("hidden");
    }
  } catch (_) {}
}

async function saveNickname() {
  const input = document.getElementById("input-nickname").value.trim();
  if (!input) { showToast("Please enter a nickname."); return; }

  if (!state.contracts.registry) {
    // Offline mode: just save locally
    state.nickname = input;
    document.getElementById("nickname-display").textContent = "🧑 " + input;
    document.getElementById("nickname-display").classList.remove("hidden");
    closeModal("modal-nickname");
    showToast("Nickname set (local – deploy contracts for on-chain storage).");
    return;
  }

  try {
    showToast("Sending transaction…");
    const tx = await state.contracts.registry.setNickname(input);
    await tx.wait();
    state.nickname = input;
    document.getElementById("nickname-display").textContent = "🧑 " + input;
    document.getElementById("nickname-display").classList.remove("hidden");
    closeModal("modal-nickname");
    showToast("Nickname saved on-chain! ✅");
  } catch (err) {
    showToast("Error: " + (err.reason || err.message));
  }
}

// ─── Online Players (simulated) ───────────────────────────────────────────────
function seedOtherPlayers() {
  // Simulated players for demo; replace with real WebSocket data in production
  state.otherPlayers = [
    { wallet: "0xABCD1234abcd1234abcd1234abcd1234abcd1234", nickname: "PixelNinja", x: 200, y: 150, color: "#52b788", dir: "right", frame: 0 },
    { wallet: "0xDEAD0000dead0000dead0000dead0000dead0000", nickname: "CryptoKing", x: 550, y: 320, color: "#ffd166", dir: "down", frame: 0 },
    { wallet: "0xCAFEBABEcafebabecafebabecafebabecafebabe", nickname: "",          x: 400, y: 100, color: "#a8d8ea", dir: "left", frame: 0 },
  ];
}

async function refreshOnlinePlayers() {
  if (state.otherPlayers.length === 0) seedOtherPlayers();
  renderOnlineList();
}

function renderOnlineList() {
  const ul = document.getElementById("online-list");
  ul.innerHTML = "";
  // Show self
  const selfLi = document.createElement("li");
  selfLi.innerHTML = `<span class="online-dot"></span><span>${state.nickname || shortAddr(state.wallet) || "You"}</span><span style="margin-left:auto;font-size:0.7rem;color:#52b788">You</span>`;
  ul.appendChild(selfLi);

  state.otherPlayers.forEach(p => {
    const li = document.createElement("li");
    const name = p.nickname || shortAddr(p.wallet);
    li.innerHTML = `<span class="online-dot"></span><span>${name}</span>`;
    li.title = "Click to private message";
    li.addEventListener("click", () => openPrivateChat(p));
    ul.appendChild(li);
  });
}

// ─── Private Chat ─────────────────────────────────────────────────────────────
function openPrivateChat(player) {
  state.pmTarget = player;
  const name = player.nickname || shortAddr(player.wallet);
  document.getElementById("pm-target-name").textContent = name;

  const msgs = state.pmMessagesMap[player.wallet] || [];
  const container = document.getElementById("pm-messages");
  container.innerHTML = "";
  msgs.forEach(m => appendPmMsg(m, false));

  openModal("modal-pm");
  document.getElementById("pm-input").focus();
}

function appendPmMsg(msg, scroll = true) {
  const container = document.getElementById("pm-messages");
  const div = document.createElement("div");
  div.className = "chat-msg private";
  div.innerHTML = `<span class="sender">${msg.sender}:</span>${escapeHtml(msg.text)}`;
  container.appendChild(div);
  if (scroll) container.scrollTop = container.scrollHeight;
}

function sendPm() {
  if (!state.pmTarget) return;
  const input = document.getElementById("pm-input");
  const text = input.value.trim();
  if (!text) return;

  const myName = state.nickname || shortAddr(state.wallet) || "You";
  const msg = { sender: myName, text };

  if (!state.pmMessagesMap[state.pmTarget.wallet]) {
    state.pmMessagesMap[state.pmTarget.wallet] = [];
  }
  state.pmMessagesMap[state.pmTarget.wallet].push(msg);
  appendPmMsg(msg);
  input.value = "";

  // Also show in global chat as private
  addGlobalMessage({ sender: myName, text: `[PM → ${state.pmTarget.nickname || shortAddr(state.pmTarget.wallet)}] ${text}`, type: "private" });
}

// ─── Global Chat ──────────────────────────────────────────────────────────────
function addGlobalMessage(msg) {
  state.globalMessages.push(msg);
  if (state.globalMessages.length > 200) state.globalMessages.shift();
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "chat-msg " + (msg.type || "");
  if (msg.type === "system") {
    div.textContent = msg.text;
  } else {
    div.innerHTML = `<span class="sender">${escapeHtml(msg.sender)}:</span>${escapeHtml(msg.text)}`;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function sendGlobalChat() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  const name = state.nickname || shortAddr(state.wallet) || "Guest";
  addGlobalMessage({ sender: name, text });
  input.value = "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── House Marketplace ────────────────────────────────────────────────────────
async function openMarket() {
  await loadHouseTypes();
  renderHouseCatalog();
  await loadMyHouses();
  openModal("modal-market");
}

async function loadHouseTypes() {
  if (!state.contracts.houseNFT) {
    // Demo data
    state.houseTypes = [
      { id: 0, name: "Wooden Hut",  buyPrice: ethers.utils.parseEther("0.1"),  sellPrice: ethers.utils.parseEther("0.05"), maxSupply: 100, minted: 12 },
      { id: 1, name: "Stone House", buyPrice: ethers.utils.parseEther("0.5"),  sellPrice: ethers.utils.parseEther("0.2"),  maxSupply: 50,  minted: 5 },
      { id: 2, name: "Castle",      buyPrice: ethers.utils.parseEther("2.0"),  sellPrice: ethers.utils.parseEther("0.8"),  maxSupply: 10,  minted: 1 },
    ];
    return;
  }
  try {
    const count = (await state.contracts.houseNFT.houseTypeCount()).toNumber();
    state.houseTypes = [];
    for (let i = 0; i < count; i++) {
      const ht = await state.contracts.houseNFT.houseTypes(i);
      state.houseTypes.push({ id: i, name: ht.name, buyPrice: ht.buyPrice, sellPrice: ht.sellPrice, maxSupply: ht.maxSupply, minted: ht.minted });
    }
  } catch (err) { showToast("Error loading houses: " + err.message); }
}

function renderHouseCatalog() {
  const el = document.getElementById("house-catalog");
  el.innerHTML = `<div class="item-grid">${state.houseTypes.map((ht, i) => `
    <div class="item-card">
      <div class="item-icon">${HOUSE_ICONS[i % HOUSE_ICONS.length]}</div>
      <div class="item-name">${escapeHtml(ht.name)}</div>
      <div class="item-price">Buy: ${fmtEth(ht.buyPrice)}</div>
      <div class="item-sell-price">Sell back: ${fmtEth(ht.sellPrice)}</div>
      <div style="font-size:0.75rem;color:#bbb;text-align:center">${ht.minted}/${ht.maxSupply || "∞"} minted</div>
      <button onclick="buyHouse(${ht.id})">Buy</button>
    </div>`).join("")}</div>`;
}

async function buyHouse(houseTypeId) {
  if (!state.wallet) { showToast("Connect wallet first."); return; }
  const ht = state.houseTypes[houseTypeId];
  if (!ht) return;

  if (!state.contracts.houseNFT) {
    showToast(`[Demo] Bought ${ht.name} for ${fmtEth(ht.buyPrice)} (contracts not deployed)`);
    addGlobalMessage({ sender: "System", text: `${state.nickname || shortAddr(state.wallet)} bought a ${ht.name}!`, type: "system" });
    return;
  }

  try {
    showToast("Sending transaction…");
    const tx = await state.contracts.houseNFT.buyFromMarket(houseTypeId, `ipfs://house-${houseTypeId}-${Date.now()}`, { value: ht.buyPrice });
    await tx.wait();
    showToast(`✅ You bought a ${ht.name}!`);
    addGlobalMessage({ sender: "System", text: `${state.nickname || shortAddr(state.wallet)} bought a ${ht.name}!`, type: "system" });
    await loadMyHouses();
  } catch (err) {
    showToast("Error: " + (err.reason || err.message));
  }
}

async function loadMyHouses() {
  const el = document.getElementById("my-houses");
  if (!state.contracts.houseNFT || !state.wallet) {
    el.innerHTML = `<p style="color:#bbb;font-size:0.85rem">Connect wallet and deploy contracts to see your houses.</p>`;
    return;
  }
  try {
    const balance = (await state.contracts.houseNFT.balanceOf(state.wallet)).toNumber();
    state.myHouseTokenIds = [];
    for (let i = 0; i < balance; i++) {
      const tokenId = (await state.contracts.houseNFT.tokenOfOwnerByIndex(state.wallet, i)).toNumber();
      state.myHouseTokenIds.push(tokenId);
    }

    if (state.myHouseTokenIds.length === 0) {
      el.innerHTML = `<p style="color:#bbb;font-size:0.85rem">You don't own any houses.</p>`;
      return;
    }

    el.innerHTML = `<div class="item-grid">${(await Promise.all(state.myHouseTokenIds.map(async (tid) => {
      const typeId = (await state.contracts.houseNFT.tokenHouseType(tid)).toNumber();
      const ht = state.houseTypes[typeId] || {};
      const icon = HOUSE_ICONS[typeId % HOUSE_ICONS.length];
      return `<div class="item-card">
        <div class="item-icon">${icon}</div>
        <div class="item-name">${escapeHtml(ht.name || "House #" + tid)}</div>
        <div class="item-price">Token #${tid}</div>
        <div class="item-sell-price">Sell back: ${fmtEth(ht.sellPrice)}</div>
        <button class="sell-btn" onclick="sellHouseBack(${tid})">Sell Back</button>
        <button class="list-btn" onclick="promptListHouse(${tid})">List for Sale</button>
      </div>`;
    }))).join("")}</div>`;
  } catch (err) { el.innerHTML = `<p style="color:#e94560">${err.message}</p>`; }
}

async function sellHouseBack(tokenId) {
  if (!state.contracts.houseNFT) { showToast("Contracts not deployed."); return; }
  try {
    showToast("Selling house back…");
    const tx = await state.contracts.houseNFT.sellToMarket(tokenId);
    await tx.wait();
    showToast("✅ House sold back!");
    await loadMyHouses();
  } catch (err) { showToast("Error: " + (err.reason || err.message)); }
}

async function promptListHouse(tokenId) {
  const price = prompt("List price in ETH (e.g. 0.08):");
  if (!price) return;
  try {
    const priceBN = ethers.utils.parseEther(price);
    showToast("Listing house…");
    const tx = await state.contracts.houseNFT.listHouse(tokenId, priceBN);
    await tx.wait();
    showToast("✅ House listed for " + price + " ETH!");
  } catch (err) { showToast("Error: " + (err.reason || err.message)); }
}

// ─── Vending Machine ──────────────────────────────────────────────────────────
async function openVending() {
  await loadFoodItems();
  renderFoodCatalog();
  openModal("modal-vending");
}

async function loadFoodItems() {
  if (!state.contracts.vending) {
    state.foodItems = [
      { id: 0, name: "Apple",  price: ethers.utils.parseEther("0.001"), stock: 0, active: true },
      { id: 1, name: "Bread",  price: ethers.utils.parseEther("0.002"), stock: 0, active: true },
      { id: 2, name: "Potion", price: ethers.utils.parseEther("0.005"), stock: 0, active: true },
      { id: 3, name: "Elixir", price: ethers.utils.parseEther("0.01"),  stock: 0, active: true },
    ];
    return;
  }
  try {
    const count = (await state.contracts.vending.foodCount()).toNumber();
    state.foodItems = [];
    for (let i = 0; i < count; i++) {
      const f = await state.contracts.vending.foodItems(i);
      state.foodItems.push({ id: i, name: f.name, price: f.price, stock: f.stock, active: f.active });
    }
  } catch (err) { showToast("Error loading food: " + err.message); }
}

function renderFoodCatalog() {
  const el = document.getElementById("food-catalog");
  el.innerHTML = `<div class="item-grid">${state.foodItems.filter(f => f.active).map((f, i) => `
    <div class="item-card">
      <div class="item-icon">${FOOD_ICONS[i % FOOD_ICONS.length]}</div>
      <div class="item-name">${escapeHtml(f.name)}</div>
      <div class="item-price">${fmtEth(f.price)} each</div>
      <div style="font-size:0.75rem;color:#bbb;text-align:center">${f.stock === 0 ? "Unlimited" : f.stock + " left"}</div>
      <button onclick="buyFood(${f.id})">Buy 1</button>
    </div>`).join("")}</div>`;
}

async function buyFood(foodId) {
  if (!state.wallet) { showToast("Connect wallet first."); return; }
  const f = state.foodItems[foodId];
  if (!f) return;

  if (!state.contracts.vending) {
    showToast(`[Demo] Bought ${f.name} for ${fmtEth(f.price)} (contracts not deployed)`);
    addGlobalMessage({ sender: "System", text: `${state.nickname || shortAddr(state.wallet)} bought ${f.name} from the vending machine!`, type: "system" });
    return;
  }

  try {
    showToast("Purchasing " + f.name + "…");
    const tx = await state.contracts.vending.buyFood(foodId, 1, { value: f.price });
    await tx.wait();
    showToast(`✅ You bought a ${f.name}!`);
    addGlobalMessage({ sender: "System", text: `${state.nickname || shortAddr(state.wallet)} bought ${f.name} from the vending machine!`, type: "system" });
  } catch (err) {
    showToast("Error: " + (err.reason || err.message));
  }
}

// ─── Skills ───────────────────────────────────────────────────────────────────
async function openSkills() {
  await loadSkillTypes();
  renderSkillsCatalog();
  openModal("modal-skills");
}

async function loadSkillTypes() {
  if (!state.contracts.skillNFT) {
    state.skillTypes = [
      { id: 0, name: "Swordsmanship", level: 1, mintPrice: ethers.utils.parseEther("0.01"), active: true },
      { id: 1, name: "Magic",         level: 3, mintPrice: ethers.utils.parseEther("0.05"), active: true },
      { id: 2, name: "Archery",       level: 2, mintPrice: ethers.utils.parseEther("0.02"), active: true },
    ];
    return;
  }
  try {
    const count = (await state.contracts.skillNFT.skillTypeCount()).toNumber();
    state.skillTypes = [];
    for (let i = 0; i < count; i++) {
      const s = await state.contracts.skillNFT.skillTypes(i);
      state.skillTypes.push({ id: i, name: s.name, level: s.level, mintPrice: s.mintPrice, active: s.active });
    }
  } catch (err) { showToast("Error loading skills: " + err.message); }
}

async function renderSkillsCatalog() {
  const el = document.getElementById("skills-catalog");
  let html = `<div class="item-grid">`;
  for (let i = 0; i < state.skillTypes.length; i++) {
    const s = state.skillTypes[i];
    if (!s.active) continue;
    let owned = false;
    if (state.contracts.skillNFT && state.wallet) {
      try { owned = await state.contracts.skillNFT.hasSkill(state.wallet, s.id); } catch (_) {}
    }
    html += `<div class="item-card">
      <div class="item-icon">${SKILL_ICONS[i % SKILL_ICONS.length]}</div>
      <div class="item-name">${escapeHtml(s.name)}</div>
      <div class="item-price">Level ${s.level}</div>
      <div class="item-sell-price">${fmtEth(s.mintPrice)}</div>
      ${owned ? `<button disabled style="background:#333;cursor:default">Owned ✅</button>` : `<button onclick="buySkill(${s.id})">Purchase</button>`}
    </div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

async function buySkill(skillTypeId) {
  if (!state.wallet) { showToast("Connect wallet first."); return; }
  const s = state.skillTypes[skillTypeId];
  if (!s) return;

  if (!state.contracts.skillNFT) {
    showToast(`[Demo] Purchased ${s.name} skill (contracts not deployed)`);
    return;
  }

  try {
    showToast("Purchasing skill…");
    const tx = await state.contracts.skillNFT.purchaseSkill(skillTypeId, `ipfs://skill-${skillTypeId}-${Date.now()}`, { value: s.mintPrice });
    await tx.wait();
    showToast(`✅ You acquired the ${s.name} skill!`);
    await renderSkillsCatalog();
  } catch (err) {
    showToast("Error: " + (err.reason || err.message));
  }
}

// ─── Canvas Rendering ─────────────────────────────────────────────────────────
const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

// World objects
const WORLD = {
  trees:    [{ x: 50, y: 50 }, { x: 100, y: 200 }, { x: 700, y: 80 }, { x: 650, y: 400 }, { x: 300, y: 430 }],
  houses:   [{ x: 120, y: 80, label: "Market" }, { x: 600, y: 120, label: "Skill Shop" }],
  vending:  { x: 380, y: 420 },
  pond:     { x: 620, y: 350, w: 80, h: 50 },
};

function drawWorld() {
  // Background
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Dirt paths
  ctx.fillStyle = COLORS.path;
  ctx.fillRect(0, 220, CANVAS_W, 30);
  ctx.fillRect(380, 0, 30, CANVAS_H);

  // Pond
  ctx.fillStyle = COLORS.water;
  const p = WORLD.pond;
  ctx.beginPath();
  ctx.ellipse(p.x + p.w/2, p.y + p.h/2, p.w/2, p.h/2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Houses
  WORLD.houses.forEach(h => {
    ctx.fillStyle = COLORS.house;
    ctx.fillRect(h.x, h.y, 60, 40);
    ctx.fillStyle = COLORS.houseRoof;
    ctx.beginPath();
    ctx.moveTo(h.x - 5, h.y);
    ctx.lineTo(h.x + 30, h.y - 20);
    ctx.lineTo(h.x + 65, h.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(h.label, h.x + 30, h.y + 52);
  });

  // Vending machine
  const vm = WORLD.vending;
  ctx.fillStyle = COLORS.vending;
  ctx.fillRect(vm.x, vm.y, 28, 36);
  ctx.fillStyle = "#333";
  ctx.fillRect(vm.x + 4, vm.y + 4, 20, 14);
  ctx.fillStyle = "#fff";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("VEND", vm.x + 14, vm.y + 50);

  // Trees
  WORLD.trees.forEach(t => {
    ctx.fillStyle = COLORS.tree;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d6a4f";
    ctx.fillRect(t.x - 3, t.y + 10, 6, 10);
  });
}

// ─── City 2: Coastal Paradise ─────────────────────────────────────────────────

// Train track oval parameters (city 2, centered in canvas)
const TRAIN_CX = 400, TRAIN_CY = 248, TRAIN_RX = 320, TRAIN_RY = 172;

function getTrainPos(prog) {
  const a = prog * Math.PI * 2 - Math.PI / 2; // start from top
  return {
    x: TRAIN_CX + TRAIN_RX * Math.cos(a),
    y: TRAIN_CY + TRAIN_RY * Math.sin(a),
  };
}

// Train stations around the oval
const TRAIN_STATIONS = [
  { prog: 0.00, label: "School"  },   // top:    (400,  76)
  { prog: 0.25, label: "Zoo"     },   // right:  (720, 248)
  { prog: 0.50, label: "Beach"   },   // bottom: (400, 420)
  { prog: 0.75, label: "Airport" },   // left:   ( 80, 248)
];

// City 2 landmark objects
const WORLD_CITY2 = {
  beach:    { y: 405 },
  mountain: { x: 630, y: 0,   w: 170, h: 185 },
  waterfall:{ x: 658, y: 148 },
  airport: {
    x: 18, y: 192, termW: 92, termH: 48,
    runwayX: 18, runwayY: 250, runwayW: 210, runwayH: 20,
    towerX: 95, towerY: 162, towerW: 22, towerH: 38,
  },
  school:  { x: 326, y: 22, w: 82, h: 50,  label: "🎓 School"  },
  hotel:   { x: 480, y: 148, w: 82, h: 72, label: "🏨 Hotel"   },
  concert: { x: 308, y: 210, w: 90, h: 56, label: "🎵 Concert" },
  zoo:     { x: 600, y: 148, w: 96, h: 72, label: "🦁 Zoo"     },
  houses: [
    { x:  78, y:  88, col: "#7b5ea7" },
    { x: 168, y: 128, col: "#6d9eeb" },
    { x: 450, y: 148, col: "#93c47d" },
    { x: 196, y: 268, col: "#e06666" },
    { x: 484, y: 268, col: "#ff9800" },
  ],
  soccer: { x: 122, y: 318, w: 184, h: 72 },
};

function drawCity2() {
  // Sky
  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Grass (above beach)
  ctx.fillStyle = "#4a8c5c";
  ctx.fillRect(0, 0, CANVAS_W, WORLD_CITY2.beach.y);
  // Roads
  ctx.fillStyle = "#555";
  ctx.fillRect(0, 286, CANVAS_W, 16);    // horizontal road (taxi lane)
  ctx.fillRect(392, 0, 16, WORLD_CITY2.beach.y); // vertical road
  ctx.fillStyle = "#fff";
  for (let rx = 20; rx < CANVAS_W; rx += 44) {
    ctx.fillRect(rx, 292, 22, 4);         // road dash
  }

  drawMountain2();
  drawWaterfall2();
  drawBeach2();
  drawAirport2();
  drawSoccerField2();
  drawTrainTrack2();
  drawCity2Buildings();
  drawCity2Houses();
  drawAirplane2();
  drawTaxi2();
  drawTrain2();
  drawCity2Bots();
  drawCity2Hints();
}

function drawMountain2() {
  const m = WORLD_CITY2.mountain;
  ctx.fillStyle = "#6b7a8d";
  ctx.beginPath();
  ctx.moveTo(m.x, m.y + m.h);
  ctx.lineTo(m.x + m.w / 2, m.y);
  ctx.lineTo(m.x + m.w, m.y + m.h);
  ctx.closePath();
  ctx.fill();
  // Snow cap
  ctx.fillStyle = "#f0f0f0";
  ctx.beginPath();
  ctx.moveTo(m.x + m.w / 2, m.y);
  ctx.lineTo(m.x + m.w / 2 - 22, m.y + 52);
  ctx.lineTo(m.x + m.w / 2 + 22, m.y + 52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("⛰ Mountain", m.x + m.w / 2, m.y + m.h + 12);
}

function drawWaterfall2() {
  const wf = WORLD_CITY2.waterfall;
  const tick = state.animTick;
  ctx.fillStyle = "#48cae4";
  ctx.fillRect(wf.x, wf.y, 9, 58);
  // Animated drops
  const dropY = wf.y + (tick * 2 % 58);
  ctx.fillStyle = "rgba(72,202,228,0.7)";
  ctx.fillRect(wf.x, dropY, 9, 14);
  // Pool
  ctx.fillStyle = "rgba(72,202,228,0.5)";
  ctx.beginPath();
  ctx.ellipse(wf.x + 4, wf.y + 62, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a8d8ea";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("💧 Waterfall", wf.x + 4, wf.y + 76);
}

function drawBeach2() {
  const by = WORLD_CITY2.beach.y;
  // Sand
  ctx.fillStyle = "#f4d03f";
  ctx.fillRect(0, by, CANVAS_W, 42);
  // Sea
  ctx.fillStyle = "#0077b6";
  ctx.fillRect(0, by + 42, CANVAS_W, CANVAS_H - by - 42);
  // Animated waves
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  const tick = state.animTick;
  for (let wx = 0; wx < CANVAS_W; wx += 64) {
    const wy = by + 48 + Math.sin((wx + tick * 2) * 0.042) * 5;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.bezierCurveTo(wx + 16, wy - 7, wx + 32, wy + 7, wx + 64, wy);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // Beach umbrella
  ctx.fillStyle = "#e94560";
  ctx.beginPath();
  ctx.arc(190, by + 12, 24, Math.PI, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(189, by + 12, 3, 24);
  // Lifeguard tower
  ctx.fillStyle = "#e94560";
  ctx.fillRect(390, by + 2, 32, 22);
  ctx.fillStyle = "#f4d03f";
  ctx.fillRect(393, by + 5, 26, 14);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("🏖 Beach", 200, by - 6);
  ctx.fillText("🛟 Lifeguard", 406, by - 3);
}

function drawAirport2() {
  const ap = WORLD_CITY2.airport;
  // Terminal
  ctx.fillStyle = "#4a5568";
  ctx.fillRect(ap.x, ap.y, ap.termW, ap.termH);
  ctx.fillStyle = "#48cae4";
  for (let i = 0; i < 4; i++) ctx.fillRect(ap.x + 7 + i * 20, ap.y + 8, 13, 20);
  // Runway
  ctx.fillStyle = "#444";
  ctx.fillRect(ap.runwayX, ap.runwayY, ap.runwayW, ap.runwayH);
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 5; i++) ctx.fillRect(ap.runwayX + 18 + i * 36, ap.runwayY + 8, 22, 4);
  // Control tower
  ctx.fillStyle = "#718096";
  ctx.fillRect(ap.towerX, ap.towerY, ap.towerW, ap.towerH);
  ctx.fillStyle = "#48cae4";
  ctx.fillRect(ap.towerX - 5, ap.towerY, ap.towerW + 10, 14);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("✈ Airport", ap.x + ap.termW / 2, ap.y - 6);
  ctx.font = "7px monospace";
  ctx.fillText("(Click for Jobs)", ap.x + ap.termW / 2, ap.y - 16);
}

function drawCity2Buildings() {
  const blds  = [WORLD_CITY2.school, WORLD_CITY2.hotel, WORLD_CITY2.concert, WORLD_CITY2.zoo];
  const walls  = ["#1e6b9e", "#7b1fa2", "#1565c0", "#2e7d32"];
  const roofs  = ["#1565c0", "#6a1b9a", "#0d47a1", "#1b5e20"];
  blds.forEach((b, i) => {
    ctx.fillStyle = walls[i];
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = roofs[i];
    ctx.beginPath();
    ctx.moveTo(b.x - 4, b.y);
    ctx.lineTo(b.x + b.w / 2, b.y - 18);
    ctx.lineTo(b.x + b.w + 4, b.y);
    ctx.closePath();
    ctx.fill();
    // Windows
    ctx.fillStyle = "rgba(255,255,200,0.65)";
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(b.x + 7 + c * 24, b.y + 7 + r * 20, 13, 11);
      }
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h + 12);
  });
}

function drawCity2Houses() {
  WORLD_CITY2.houses.forEach(h => {
    ctx.fillStyle = h.col;
    ctx.fillRect(h.x, h.y, 36, 26);
    ctx.fillStyle = COLORS.houseRoof;
    ctx.beginPath();
    ctx.moveTo(h.x - 4, h.y);
    ctx.lineTo(h.x + 18, h.y - 14);
    ctx.lineTo(h.x + 40, h.y);
    ctx.closePath();
    ctx.fill();
  });
}

function drawSoccerField2() {
  const sf = WORLD_CITY2.soccer;
  const { x, y, w, h } = sf;
  // Field grass
  ctx.fillStyle = "#2e8b2e";
  ctx.fillRect(x, y, w, h);
  // Alternating grass stripes
  ctx.fillStyle = "#297829";
  for (let s = 0; s < 4; s++) {
    ctx.fillRect(x + s * (w / 4), y, w / 8, h);
  }
  // White boundary lines
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  // Center line
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 2);
  ctx.lineTo(x + w / 2, y + h - 2);
  ctx.stroke();
  // Center circle
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, 14, 0, Math.PI * 2);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Penalty boxes
  ctx.strokeRect(x + 2, y + h / 2 - 16, 28, 32);
  ctx.strokeRect(x + w - 30, y + h / 2 - 16, 28, 32);
  // Goal areas (smaller boxes)
  ctx.strokeRect(x + 2, y + h / 2 - 8, 14, 16);
  ctx.strokeRect(x + w - 16, y + h / 2 - 8, 14, 16);
  // Goals (left and right)
  ctx.fillStyle = "#ddd";
  ctx.fillRect(x - 9, y + h / 2 - 11, 9, 22);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 8, y + h / 2 - 10, 7, 20);
  ctx.fillStyle = "#ddd";
  ctx.fillRect(x + w, y + h / 2 - 11, 9, 22);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + w + 1, y + h / 2 - 10, 7, 20);
  // Goal nets (simple mesh hint)
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  for (let gi = 1; gi < 4; gi++) {
    ctx.beginPath();
    ctx.moveTo(x - 8, y + h / 2 - 10 + gi * 5);
    ctx.lineTo(x - 1, y + h / 2 - 10 + gi * 5);
    ctx.stroke();
  }
  for (let gi = 1; gi < 4; gi++) {
    ctx.beginPath();
    ctx.moveTo(x + w + 1, y + h / 2 - 10 + gi * 5);
    ctx.lineTo(x + w + 8, y + h / 2 - 10 + gi * 5);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // Label
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("⚽ Soccer Field", x + w / 2, y + h + 12);
}

function initCity2Bots() {
  if (state.city2Bots) return;
  // Each bot: name, starting x/y, body color, patrol minX/maxX, fixed y, speed, dir
  state.city2Bots = [
    // Beach walkers
    { name: "Surfer",    x: 180, y: 391, color: "#52b788", minX:  70, maxX: 360, fixedY: 391, speed: 0.75, dir:  1 },
    { name: "BeachKid",  x: 310, y: 391, color: "#ffd166", minX:  70, maxX: 360, fixedY: 391, speed: 0.90, dir: -1 },
    { name: "Swimmer",   x: 530, y: 391, color: "#48cae4", minX: 380, maxX: 700, fixedY: 391, speed: 0.65, dir:  1 },
    // School area
    { name: "Student",   x: 350, y: 76,  color: "#a8d8ea", minX: 310, maxX: 430, fixedY:  76, speed: 0.60, dir:  1 },
    { name: "Teacher",   x: 418, y: 76,  color: "#ffd166", minX: 310, maxX: 430, fixedY:  76, speed: 0.45, dir: -1 },
    // Zoo area
    { name: "Zookeeper", x: 645, y: 195, color: "#93c47d", minX: 598, maxX: 700, fixedY: 195, speed: 0.55, dir:  1 },
    { name: "Visitor",   x: 615, y: 215, color: "#e94560", minX: 598, maxX: 700, fixedY: 215, speed: 0.50, dir: -1 },
    // Soccer field area (fans & players)
    { name: "Fan1",      x: 150, y: 335, color: "#2196f3", minX: 125, maxX: 290, fixedY: 335, speed: 0.80, dir:  1 },
    { name: "Fan2",      x: 260, y: 365, color: "#4caf50", minX: 125, maxX: 290, fixedY: 365, speed: 0.75, dir: -1 },
    { name: "Referee",   x: 210, y: 350, color: "#000",    minX: 125, maxX: 290, fixedY: 350, speed: 0.95, dir:  1 },
    // Jogger on road
    { name: "Jogger",    x: 230, y: 294, color: "#ff9800", minX:  90, maxX: 560, fixedY: 294, speed: 1.30, dir:  1 },
    // Concert area
    { name: "Musician",  x: 330, y: 258, color: "#ab47bc", minX: 308, maxX: 400, fixedY: 258, speed: 0.50, dir:  1 },
    // Hotel area
    { name: "Tourist",   x: 500, y: 218, color: "#90a4ae", minX: 475, maxX: 565, fixedY: 218, speed: 0.55, dir: -1 },
  ];
}

function drawCity2Bots() {
  if (!state.city2Bots) return;
  state.city2Bots.forEach(bot => {
    drawCharacter(bot.x, bot.y, bot.color, bot.name);
  });
}

function drawTrainTrack2() {
  // Rails
  ctx.strokeStyle = "#795548";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(TRAIN_CX, TRAIN_CY, TRAIN_RX, TRAIN_RY, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Cross ties
  ctx.strokeStyle = "#5d4037";
  ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(TRAIN_CX + TRAIN_RX * 0.955 * Math.cos(a), TRAIN_CY + TRAIN_RY * 0.955 * Math.sin(a));
    ctx.lineTo(TRAIN_CX + TRAIN_RX * 1.045 * Math.cos(a), TRAIN_CY + TRAIN_RY * 1.045 * Math.sin(a));
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // Station markers
  TRAIN_STATIONS.forEach(st => {
    const pos = getTrainPos(st.prog);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e94560";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#000";
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.fillText(st.label, pos.x, pos.y + 17);
  });
}

function drawTrain2() {
  const pos = getTrainPos(state.train.progress);
  // Locomotive body
  ctx.fillStyle = "#c62828";
  ctx.fillRect(pos.x - 16, pos.y - 10, 32, 18);
  // Cab
  ctx.fillStyle = "#b71c1c";
  ctx.fillRect(pos.x - 8, pos.y - 18, 16, 10);
  // Wheels
  ctx.fillStyle = "#212121";
  [pos.x - 10, pos.x + 10].forEach(wx => {
    ctx.beginPath();
    ctx.arc(wx, pos.y + 8, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Chimney
  ctx.fillStyle = "#37474f";
  ctx.fillRect(pos.x - 3, pos.y - 24, 6, 8);
  // Steam puff (animated)
  if (state.animTick % 24 < 12) {
    ctx.fillStyle = "rgba(220,220,220,0.5)";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 28, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Label
  ctx.fillStyle = "#fff";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("🚂", pos.x, pos.y - 32);
}

function drawAirplane2() {
  const a = state.airplane;
  const x = a.x, y = a.y;
  // Fuselage
  ctx.fillStyle = "#eceff1";
  ctx.fillRect(x - 22, y - 6, 44, 12);
  // Nose
  ctx.fillStyle = "#90a4ae";
  ctx.beginPath();
  ctx.moveTo(x + 22, y - 6);
  ctx.lineTo(x + 40, y);
  ctx.lineTo(x + 22, y + 6);
  ctx.closePath();
  ctx.fill();
  // Wings
  ctx.fillStyle = "#b0bec5";
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 6);
  ctx.lineTo(x + 12, y - 22);
  ctx.lineTo(x + 16, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 6);
  ctx.lineTo(x + 12, y + 22);
  ctx.lineTo(x + 16, y + 6);
  ctx.closePath();
  ctx.fill();
  // Tail fin
  ctx.fillStyle = "#90a4ae";
  ctx.beginPath();
  ctx.moveTo(x - 22, y - 6);
  ctx.lineTo(x - 32, y - 17);
  ctx.lineTo(x - 18, y - 6);
  ctx.closePath();
  ctx.fill();
  // Windows
  ctx.fillStyle = "#48cae4";
  for (let i = 0; i < 3; i++) ctx.fillRect(x - 14 + i * 11, y - 4, 7, 7);
  // Label
  ctx.fillStyle = "#fff";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("✈ Int'l Flight →", x, y - 30);
}

function drawTaxi2() {
  const t = state.taxi;
  const x = t.x, y = t.y;
  // Taxi body
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(x - 22, y - 11, 44, 20);
  // Roof
  ctx.fillStyle = "#f4c430";
  ctx.fillRect(x - 14, y - 22, 28, 13);
  // Windscreen
  ctx.fillStyle = "#48cae4";
  ctx.fillRect(x - 12, y - 20, 11, 9);
  ctx.fillRect(x + 2, y - 20, 11, 9);
  // Wheels
  ctx.fillStyle = "#212121";
  [x - 14, x + 14].forEach(wx => {
    ctx.beginPath();
    ctx.arc(wx, y + 9, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  // TAXI sign
  ctx.fillStyle = "#e94560";
  ctx.fillRect(x - 9, y - 28, 18, 7);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 5px monospace";
  ctx.textAlign = "center";
  ctx.fillText("TAXI", x, y - 23);
  // Board hint
  if (t.nearPlayer) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x - 50, y - 46, 100, 18);
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(t.onBoard ? "[E] Exit Taxi" : "[E] Enter Taxi", x, y - 33);
  }
}

function drawCity2Hints() {
  const tr = state.train;
  if (tr.nearStation < 0) return;
  const stn = TRAIN_STATIONS[tr.nearStation];
  const pos = getTrainPos(stn.prog);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(pos.x - 56, pos.y - 42, 112, 20);
  ctx.fillStyle = "#ffd166";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText(tr.onBoard ? "[E] Leave Train" : "[E] Board Train", pos.x, pos.y - 27);
}

function updateCity2() {
  const tr = state.train;
  const p  = state.player;

  // Advance train along track
  tr.progress = (tr.progress + tr.speed) % 1;

  if (tr.onBoard) {
    // Move player with train
    const tpos = getTrainPos(tr.progress);
    p.x = tpos.x;
    p.y = tpos.y;
    // Check if train is near a station to allow disembark
    let nearIdx = -1;
    TRAIN_STATIONS.forEach((st, i) => {
      const diff = Math.abs(tr.progress - st.prog);
      if (diff < 0.04 || diff > 0.96) nearIdx = i;
    });
    tr.nearStation = nearIdx;
  } else {
    // Check if player is near any station to allow boarding
    let nearIdx = -1;
    TRAIN_STATIONS.forEach((st, i) => {
      const pos = getTrainPos(st.prog);
      const dx = p.x - pos.x, dy = p.y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 38) nearIdx = i;
    });
    tr.nearStation = nearIdx;
  }

  // Advance airplane (flies right and loops)
  const ap = state.airplane;
  ap.x += ap.speed;
  if (ap.x > CANVAS_W + 160) ap.x = -160;

  // Advance taxi (oscillates left-right on the road)
  const tx = state.taxi;
  if (!tx.onBoard) {
    tx.x += tx.speed * tx.dir;
    if (tx.x > 570) tx.dir = -1;
    if (tx.x < 110) tx.dir =  1;
  } else {
    tx.x += tx.speed * tx.dir;
    if (tx.x > 570) tx.dir = -1;
    if (tx.x < 110) tx.dir =  1;
    p.x = tx.x;
    p.y = tx.y;
  }
  const tdx = p.x - tx.x, tdy = p.y - tx.y;
  tx.nearPlayer = !tr.onBoard && Math.sqrt(tdx * tdx + tdy * tdy) < 38;

  // Initialize and update city 2 NPC bots
  initCity2Bots();
  state.city2Bots.forEach(bot => {
    bot.x += bot.speed * bot.dir;
    if (bot.x >= bot.maxX) { bot.x = bot.maxX; bot.dir = -1; }
    if (bot.x <= bot.minX) { bot.x = bot.minX; bot.dir =  1; }
    bot.y = bot.fixedY; // keep on patrol lane
  });
}

// ─── City switcher ────────────────────────────────────────────────────────────
function switchCity(city) {
  state.currentCity = city;
  // Reset player to center
  state.player.x = CANVAS_W / 2;
  state.player.y = CANVAS_H / 2;
  // Reset boarding states when leaving city 2
  if (city !== 2) {
    state.train.onBoard = false;
    state.taxi.onBoard  = false;
  }
  document.getElementById("btn-city1").classList.toggle("active", city === 1);
  document.getElementById("btn-city2").classList.toggle("active", city === 2);
  const msg = city === 1 ? "🏙 Welcome to Modern City!" : "🌴 Welcome to Coastal Paradise!";
  showToast(msg);
  addGlobalMessage({ sender: "System", text: msg, type: "system" });
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────
function openJobs() {
  const el = document.getElementById("active-job-display");
  const names = { pilot: "✈️ Pilot", masinis: "🚂 Train Driver (Masinis)", lifeguard: "🛟 Lifeguard", taxi: "🚕 Taxi Driver" };
  el.textContent = state.jobs.current ? `Current job: ${names[state.jobs.current]}` : "";
  openModal("modal-jobs");
}

function takeJob(jobType) {
  if (!state.wallet) { showToast("Connect wallet first to take a job."); return; }
  const names = { pilot: "✈️ Pilot", masinis: "🚂 Train Driver (Masinis)", lifeguard: "🛟 Lifeguard", taxi: "🚕 Taxi Driver" };
  state.jobs.current = jobType;
  const name = names[jobType];
  showToast(`✅ You got the job: ${name}!`);
  addGlobalMessage({ sender: "System", text: `${state.nickname || shortAddr(state.wallet) || "Player"} became a ${name}!`, type: "system" });
  document.getElementById("active-job-display").textContent = `Current job: ${name}`;
  closeModal("modal-jobs");
}

function drawCharacter(x, y, color, name, isPlayer = false) {
  // Shadow
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x - 8, y - 8, 16, 20);

  // Head
  ctx.fillStyle = "#f4a261";
  ctx.fillRect(x - 7, y - 20, 14, 14);

  // Eyes
  ctx.fillStyle = "#000";
  ctx.fillRect(x - 4, y - 16, 3, 3);
  ctx.fillRect(x + 1, y - 16, 3, 3);

  // Player indicator ring
  if (isPlayer) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 8, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Name tag
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = isPlayer ? "#ffd166" : "#e0e0e0";
  ctx.fillText(name || "?", x, y - 26);
}

function gameLoop() {
  // Move player (only when not locked to vehicle)
  const p = state.player;
  const lockedToTrain = state.currentCity === 2 && state.train.onBoard;
  const lockedToTaxi  = state.currentCity === 2 && state.taxi.onBoard;
  p.moving = false;
  if (!lockedToTrain && !lockedToTaxi) {
    if (state.keys["ArrowLeft"]  || state.keys["a"] || state.keys["A"]) { p.x -= PLAYER_SPEED; p.dir = "left";  p.moving = true; }
    if (state.keys["ArrowRight"] || state.keys["d"] || state.keys["D"]) { p.x += PLAYER_SPEED; p.dir = "right"; p.moving = true; }
    if (state.keys["ArrowUp"]    || state.keys["w"] || state.keys["W"]) { p.y -= PLAYER_SPEED; p.dir = "up";    p.moving = true; }
    if (state.keys["ArrowDown"]  || state.keys["s"] || state.keys["S"]) { p.y += PLAYER_SPEED; p.dir = "down";  p.moving = true; }
  }

  // Clamp to canvas
  p.x = Math.max(16, Math.min(CANVAS_W - 16, p.x));
  p.y = Math.max(20, Math.min(CANVAS_H - 20, p.y));

  // Animate other players slightly
  state.animTick++;
  state.otherPlayers.forEach((op, i) => {
    if (state.animTick % 80 === i * 27 % 80) {
      op.x += (Math.random() - 0.5) * 20;
      op.y += (Math.random() - 0.5) * 20;
      op.x = Math.max(20, Math.min(CANVAS_W - 20, op.x));
      op.y = Math.max(20, Math.min(CANVAS_H - 20, op.y));
    }
  });

  // City-specific update & draw
  if (state.currentCity === 2) {
    updateCity2();
    drawCity2();
  } else {
    drawWorld();
  }

  // Draw other players
  state.otherPlayers.forEach(op => {
    drawCharacter(op.x, op.y, op.color, op.nickname || shortAddr(op.wallet));
  });

  // Draw local player
  const myName = state.nickname || shortAddr(state.wallet) || "You";
  drawCharacter(p.x, p.y, p.color, myName, true);

  requestAnimationFrame(gameLoop);
}

// ─── Click on Canvas → click character ───────────────────────────────────────
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top)  * scaleY;

  // Check if click is on another player
  for (const op of state.otherPlayers) {
    const dx = cx - op.x;
    const dy = cy - op.y;
    if (Math.sqrt(dx*dx + dy*dy) < 20) {
      openPrivateChat(op);
      return;
    }
  }

  if (state.currentCity === 2) {
    // Check if click is on an NPC bot
    if (state.city2Bots) {
      for (const bot of state.city2Bots) {
        const dx = cx - bot.x, dy = cy - bot.y;
        if (Math.sqrt(dx * dx + dy * dy) < 18) {
          showToast(`👋 ${bot.name} says: "Hello traveller!"`);
          return;
        }
      }
    }
    // City 2 building interactions
    const c2 = WORLD_CITY2;
    const ap = c2.airport;
    if (cx >= ap.x && cx <= ap.x + ap.termW && cy >= ap.y - 10 && cy <= ap.y + ap.termH) {
      openJobs(); return;
    }
    const sc = c2.school;
    if (cx >= sc.x && cx <= sc.x + sc.w && cy >= sc.y - 18 && cy <= sc.y + sc.h) {
      openSkills(); return;
    }
    const co = c2.concert;
    if (cx >= co.x && cx <= co.x + co.w && cy >= co.y - 18 && cy <= co.y + co.h) {
      showToast("🎵 Tonight's concert: CryptoBeats Live! Ticket: 0.005 ETH"); return;
    }
    const zo = c2.zoo;
    if (cx >= zo.x && cx <= zo.x + zo.w && cy >= zo.y - 18 && cy <= zo.y + zo.h) {
      showToast("🦁 City Zoo – Lions, Tigers, Pandas & more! Entry: 0.003 ETH"); return;
    }
    const ho = c2.hotel;
    if (cx >= ho.x && cx <= ho.x + ho.w && cy >= ho.y - 18 && cy <= ho.y + ho.h) {
      showToast("🏨 Hotel Paradise – Luxury rooms available. Rate: 0.01 ETH/night"); return;
    }
    const sf = c2.soccer;
    if (cx >= sf.x - 9 && cx <= sf.x + sf.w + 9 && cy >= sf.y && cy <= sf.y + sf.h + 14) {
      showToast("⚽ Soccer Field – Match today at 5PM! Admission: 0.002 ETH"); return;
    }
    return; // no other click actions in city 2
  }

  // City 1: Check if click is near vending machine
  const vm = WORLD.vending;
  if (cx >= vm.x - 10 && cx <= vm.x + 38 && cy >= vm.y - 10 && cy <= vm.y + 46) {
    openVending();
    return;
  }

  // City 1: Check houses
  WORLD.houses.forEach((h, i) => {
    if (cx >= h.x && cx <= h.x + 60 && cy >= h.y - 20 && cy <= h.y + 40) {
      if (i === 0) openMarket();
      else if (i === 1) openSkills();
    }
  });
});

canvas.style.cursor = "pointer";

// ─── Keyboard ─────────────────────────────────────────────────────────────────
window.addEventListener("keydown", e => {
  state.keys[e.key] = true;
  // Enter to send chat
  if (e.key === "Enter") {
    if (document.activeElement === document.getElementById("chat-input")) sendGlobalChat();
    if (document.activeElement === document.getElementById("pm-input"))   sendPm();
  }
  // E key: board/leave train or taxi in city 2
  if ((e.key === "e" || e.key === "E") && state.currentCity === 2) {
    const tr = state.train;
    const tx = state.taxi;
    if (tr.nearStation >= 0) {
      tr.onBoard = !tr.onBoard;
      if (tr.onBoard) {
        tx.onBoard = false; // can't be in both
        showToast(`🚂 Boarded train at ${TRAIN_STATIONS[tr.nearStation].label} Station!`);
      } else {
        showToast(`🚂 Disembarked at ${TRAIN_STATIONS[tr.nearStation].label} Station.`);
      }
    } else if (tx.nearPlayer) {
      tx.onBoard = !tx.onBoard;
      showToast(tx.onBoard ? "🚕 Entered taxi!" : "🚕 Exited taxi.");
    }
  }
});
window.addEventListener("keyup",   e => { state.keys[e.key] = false; });

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tabId = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
    document.getElementById(tabId).classList.remove("hidden");

    // Load player listings on demand
    if (tabId === "player-listings") loadPlayerListings();
    if (tabId === "sell-houses") loadMyHouses();
  });
});

async function loadPlayerListings() {
  const el = document.getElementById("listings-list");
  el.innerHTML = `<p style="color:#bbb;font-size:0.85rem">Player-to-player listings require deployed contracts.</p>`;
}

// ─── Cancel / close modal buttons ────────────────────────────────────────────
document.querySelectorAll(".btn-cancel[data-modal]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.modal));
});

// ─── Wire up buttons ──────────────────────────────────────────────────────────
document.getElementById("btn-connect").addEventListener("click", connectWallet);
document.getElementById("btn-set-nickname").addEventListener("click", () => {
  document.getElementById("input-nickname").value = state.nickname;
  openModal("modal-nickname");
});
document.getElementById("btn-save-nickname").addEventListener("click", saveNickname);
document.getElementById("btn-open-market").addEventListener("click", openMarket);
document.getElementById("btn-open-vending").addEventListener("click", openVending);
document.getElementById("btn-open-skills").addEventListener("click", openSkills);
document.getElementById("btn-open-jobs").addEventListener("click", openJobs);
document.getElementById("btn-send").addEventListener("click", sendGlobalChat);
document.getElementById("btn-send-pm").addEventListener("click", sendPm);
document.getElementById("btn-close-pm").addEventListener("click", () => {
  // Optionally close PM mode in sidebar (not used in current layout)
});

// Close modals when clicking overlay
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", e => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
seedOtherPlayers();
renderOnlineList();
addGlobalMessage({ sender: "System", text: "Welcome to PixelCrypto! Connect your wallet to play.", type: "system" });
addGlobalMessage({ sender: "System", text: "Click on characters to chat privately. Use WASD/Arrow keys to move.", type: "system" });
addGlobalMessage({ sender: "System", text: "Switch to 🌴 Coastal City for beach, train, airport, zoo & more! Press [E] to board vehicles.", type: "system" });
gameLoop();
