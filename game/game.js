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
  // Move player
  const p = state.player;
  p.moving = false;
  if (state.keys["ArrowLeft"]  || state.keys["a"] || state.keys["A"]) { p.x -= PLAYER_SPEED; p.dir = "left";  p.moving = true; }
  if (state.keys["ArrowRight"] || state.keys["d"] || state.keys["D"]) { p.x += PLAYER_SPEED; p.dir = "right"; p.moving = true; }
  if (state.keys["ArrowUp"]    || state.keys["w"] || state.keys["W"]) { p.y -= PLAYER_SPEED; p.dir = "up";    p.moving = true; }
  if (state.keys["ArrowDown"]  || state.keys["s"] || state.keys["S"]) { p.y += PLAYER_SPEED; p.dir = "down";  p.moving = true; }

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

  // Draw
  drawWorld();

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

  // Check if click is near vending machine
  const vm = WORLD.vending;
  if (cx >= vm.x - 10 && cx <= vm.x + 38 && cy >= vm.y - 10 && cy <= vm.y + 46) {
    openVending();
    return;
  }

  // Check houses
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
gameLoop();
