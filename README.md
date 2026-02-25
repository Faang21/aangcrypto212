# PixelCrypto Game 🎮

A browser-based pixel RPG game with Web3 / blockchain integration.

## Features

| Feature | Description |
|---------|-------------|
| **Pixel World** | HTML5 Canvas game with WASD/Arrow-key movement |
| **Private Chat** | Click a player's character **or** their name in the online list to open a private message |
| **Character Nickname** | Set a display name for your pixel character (stored on-chain via `PlayerRegistry`); the wallet address always remains the source of truth |
| **Vending Machine** | Buy food items – every purchase is an on-chain transaction (`VendingMachine`) |
| **House Marketplace** | Buy houses at market price; sell back at a lower buyback price; list / buy from other players (`HouseNFT`) |
| **Skill NFTs** | Purchase or receive ERC-721 skill certificates (`SkillNFT`) |
| **Learning NFTs** | Soulbound (non-transferable) course-completion certificates (`LearningNFT`) |

---

## Project Structure

```
aangcrypto212/
├── contracts/
│   ├── PlayerRegistry.sol   – on-chain nickname ↔ wallet mapping
│   ├── HouseNFT.sol         – ERC-721 for in-game houses + marketplace
│   ├── SkillNFT.sol         – ERC-721 for in-game skills
│   ├── LearningNFT.sol      – ERC-721 soulbound learning certificates
│   └── VendingMachine.sol   – on-chain food purchase contract
├── scripts/
│   └── deploy.js            – deploy all contracts & write addresses to game/
├── test/
│   └── contracts.test.js    – Hardhat/Mocha/Chai tests
├── game/
│   ├── index.html           – game UI (single page)
│   ├── style.css            – dark pixel-art theme
│   ├── game.js              – pixel game engine + Web3 integration
│   └── contract-abis.js     – ABI fragments + address loader
├── hardhat.config.js
└── package.json
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start a local Hardhat node
```bash
npm run node
```

### 3. Deploy contracts (in a second terminal)
```bash
npm run deploy:local
```
This writes `game/contract-addresses.json` automatically.

### 4. Open the game
Serve the `game/` folder with any static server, e.g.:
```bash
npx serve game
```
Then open `http://localhost:3000` in your browser.

---

## Smart Contracts

### PlayerRegistry
Maps wallet addresses to unique pixel nicknames (1–24 alphanumeric characters).
Nicknames are case-insensitive for uniqueness checks.

### HouseNFT (ERC-721)
* **Buy from market** – pay `buyPrice` (e.g. 0.1 ETH for Wooden Hut).
* **Sell back to market** – receive `sellPrice` (e.g. 0.05 ETH) — always lower than `buyPrice`.
* **Player listings** – list your house at any price; other players can buy it directly.

| House Type  | Buy Price | Sell Price | Max Supply |
|-------------|-----------|------------|------------|
| Wooden Hut  | 0.1 ETH   | 0.05 ETH   | 100        |
| Stone House | 0.5 ETH   | 0.2 ETH    | 50         |
| Castle      | 2.0 ETH   | 0.8 ETH    | 10         |

### SkillNFT (ERC-721)
Players can purchase skill NFTs or have them granted by the game server.
Each wallet can only hold one token per skill type.

### LearningNFT (ERC-721)
Soulbound certificates issued on course completion.
Transfer can be enabled per-course for a future marketplace.

### VendingMachine
On-chain food purchase with full purchase history per wallet.

| Food   | Price     |
|--------|-----------|
| Apple  | 0.001 ETH |
| Bread  | 0.002 ETH |
| Potion | 0.005 ETH |
| Elixir | 0.01 ETH  |

---

## Replacing Contracts for Mainnet
Update `game/contract-addresses.json` (or the `window.CONTRACT_ADDRESSES` object in `game/contract-abis.js`) with the live mainnet addresses after deploying with:
```bash
npm run deploy -- --network mainnet
```

---

## Testing
```bash
npm test
```
Runs Hardhat tests covering all five contracts.
