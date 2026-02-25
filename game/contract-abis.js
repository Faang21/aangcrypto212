/**
 * contract-abis.js
 * ABI fragments and contract addresses for the PixelCrypto game.
 *
 * Replace CONTRACT_ADDRESSES values with the actual deployed addresses
 * after running `npm run deploy:local` (or your mainnet deploy script).
 * The full ABI arrays below match the Solidity contracts in ../contracts/.
 */

// ─── Contract Addresses ────────────────────────────────────────────────────
// These are populated by scripts/deploy.js at deploy-time (contract-addresses.json).
// For local dev you can also hardcode them here.
window.CONTRACT_ADDRESSES = {
  playerRegistry: "",
  skillNFT: "",
  houseNFT: "",
  learningNFT: "",
  vendingMachine: "",
};

// Try to load dynamic addresses from deploy output
(async () => {
  try {
    const res = await fetch("contract-addresses.json");
    if (res.ok) {
      const data = await res.json();
      Object.assign(window.CONTRACT_ADDRESSES, data);
      console.log("Loaded contract addresses:", window.CONTRACT_ADDRESSES);
    }
  } catch (_) { /* file not present yet – use env values */ }
})();

// ─── ABIs ──────────────────────────────────────────────────────────────────

window.ABI_PLAYER_REGISTRY = [
  "function setNickname(string memory nickname) external",
  "function getNickname(address wallet) external view returns (string memory)",
  "function getWalletByNickname(string memory nickname) external view returns (address)",
  "function hasNickname(address wallet) external view returns (bool)",
  "event NicknameSet(address indexed wallet, string nickname)"
];

window.ABI_SKILL_NFT = [
  "function skillTypeCount() external view returns (uint256)",
  "function skillTypes(uint256 typeId) external view returns (string name, uint8 level, uint256 mintPrice, bool active)",
  "function hasSkill(address wallet, uint256 skillTypeId) external view returns (bool)",
  "function purchaseSkill(uint256 skillTypeId, string memory tokenURI) external payable",
  "event SkillMinted(address indexed to, uint256 indexed tokenId, uint256 indexed skillTypeId)"
];

window.ABI_HOUSE_NFT = [
  "function houseTypeCount() external view returns (uint256)",
  "function houseTypes(uint256 typeId) external view returns (string name, uint256 buyPrice, uint256 sellPrice, uint256 maxSupply, uint256 minted)",
  "function buyFromMarket(uint256 houseTypeId, string memory tokenURI) external payable",
  "function sellToMarket(uint256 tokenId) external",
  "function listHouse(uint256 tokenId, uint256 price) external",
  "function delistHouse(uint256 tokenId) external",
  "function buyFromPlayer(uint256 tokenId) external payable",
  "function tokenHouseType(uint256 tokenId) external view returns (uint256)",
  "function listings(uint256 tokenId) external view returns (address seller, uint256 price, bool active)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "event HouseMinted(address indexed to, uint256 indexed tokenId, uint256 indexed houseTypeId)",
  "event HouseSoldBack(uint256 indexed tokenId, address indexed seller, uint256 price)"
];

window.ABI_VENDING = [
  "function foodCount() external view returns (uint256)",
  "function foodItems(uint256 foodId) external view returns (string name, uint256 price, uint256 stock, bool active)",
  "function buyFood(uint256 foodId, uint256 quantity) external payable",
  "function getPurchaseHistory(address buyer) external view returns (tuple(uint256 foodId, uint256 quantity, uint256 timestamp)[] memory)",
  "function totalRevenue() external view returns (uint256)",
  "event FoodPurchased(address indexed buyer, uint256 indexed foodId, uint256 quantity, uint256 totalPaid)"
];
