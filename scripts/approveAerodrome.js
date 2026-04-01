/**
 * approveAerodrome.js
 *
 * Force-approves the MOGA token for the Aerodrome Router on Base.
 * Uses a manually fetched nonce and a fixed 10 Gwei gas price to ensure
 * the transaction goes through even during periods of network congestion
 * or stuck pending transactions.
 *
 * Usage:
 *   npx hardhat run scripts/approveAerodrome.js --network base
 *
 * Environment variables:
 *   PRIVATE_KEY  – owner / deployer private key
 */

const hre = require("hardhat");
const { ethers } = hre;

// ─── Addresses ────────────────────────────────────────────────────────────────

// MOGA OFT / token contract on Base
const MOGA_ADDRESS = "0x83296cbE860C2471f2ae3E75Ab8e99Cc2B7434e3";

// Aerodrome Router on Base (v2 universal router)
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";

// ─── Minimal ERC-20 ABI ───────────────────────────────────────────────────────
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function symbol() external view returns (string)",
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Signer    :", deployer.address);
  console.log("Network   :", hre.network.name);

  const token = new ethers.Contract(MOGA_ADDRESS, ERC20_ABI, deployer);

  const symbol = await token.symbol();
  console.log("Token     :", symbol, "@", MOGA_ADDRESS);

  // Check existing allowance
  const current = await token.allowance(deployer.address, AERODROME_ROUTER);
  console.log("Current allowance:", current.toString());

  // Fetch nonce manually via provider (works with ethers v5 and v6)
  const nonce = await deployer.provider.getTransactionCount(deployer.address, "latest");
  console.log("Nonce     :", nonce);

  // Use 10 Gwei gas price to force-push through
  // ethers v6: ethers.parseUnits / ethers.MaxUint256 (no .utils / .constants)
  const gasPrice = ethers.parseUnits("10", "gwei");
  console.log("Gas price :", ethers.formatUnits(gasPrice, "gwei"), "Gwei");

  console.log("\nForce approving with high gas price (10 Gwei)...");

  const tx = await token.approve(
    AERODROME_ROUTER,
    ethers.MaxUint256,
    { nonce, gasPrice }
  );

  console.log("Tx hash   :", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("\n✅ Approval successful!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });
