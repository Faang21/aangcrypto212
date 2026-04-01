/**
 * setPeerOFT.js
 *
 * Registers LayerZero OFT peer addresses so that cross-chain messages can be
 * sent between the MOGA OFT Adapter on BNB and its counterpart contracts on
 * other chains (Base, Arbitrum).
 *
 * Usage:
 *   npx hardhat run scripts/setPeerOFT.js --network bnb
 *   npx hardhat run scripts/setPeerOFT.js --network base
 *   npx hardhat run scripts/setPeerOFT.js --network arbitrum
 *   npx hardhat run scripts/setPeerOFT.js --network arbitrumOne
 *   npx hardhat run scripts/setPeerOFT.js --network educhain
 *
 * Environment variables:
 *   PRIVATE_KEY  – deployer / owner private key
 *
 * LayerZero v2 endpoint IDs:
 *   Ethereum  30101
 *   BNB       30102
 *   Base      30184
 *   Arbitrum  30110
 *   EDUChain  30328
 */

const hre = require("hardhat");
const { ethers } = hre;

// ─── Minimal ABI for OFT / OFTAdapter peer management ────────────────────────
const OFT_ABI = [
  "function setPeer(uint32 _eid, bytes32 _peer) external",
  "function peers(uint32 _eid) external view returns (bytes32)",
  "function owner() external view returns (address)",
];

// ─── LayerZero v2 Endpoint IDs ────────────────────────────────────────────────
const EID = {
  bnb:         30102,
  base:        30184,
  arbitrum:    30110,
  arbitrumOne: 30110,
  educhain:    30328,
};

// ─── Deployed OFT / OFTAdapter addresses per chain ───────────────────────────
//   Replace these with the actual deployed addresses for each network.
const OFT_ADDRESS = {
  bnb:         "0xeB9eC94F90909A39436A3705BFC5bc2B9e413A87",
  base:        "0x83296cbE860C2471f2ae3E75Ab8e99Cc2B7434e3",
  arbitrum:    "0x8C9d56537E753f688bD968CC12384E5A52F75361",
  arbitrumOne: "0x8C9d56537E753f688bD968CC12384E5A52F75361",
  educhain:    "0x3AAd0Edc9c27A9CcEacDe3072bc8B11c2E4996Af",
};

// ─── Peer config: for each network, which remote chains to register ───────────
//   Key   = network you are currently running the script on
//   Value = array of remote networks whose OFT addresses should be set as peers
const PEER_MAP = {
  bnb:         ["base", "arbitrum", "educhain"],
  base:        ["bnb",  "arbitrum", "educhain"],
  arbitrum:    ["bnb",  "base",     "educhain"],
  arbitrumOne: ["bnb",  "base",     "educhain"],
  educhain:    ["bnb",  "base",     "arbitrum"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Encode a 20-byte EVM address as a 32-byte (bytes32) value required by
 * LayerZero's setPeer().  Using hexZeroPad avoids the address-truncation
 * error that causes a revert inside OFTCore.setPeer().
 *
 * @param {string} address  Checksummed or lowercase EVM address (0x…)
 * @param {string} label    Human-readable label used in error messages
 * @returns {string}        0x-prefixed 32-byte hex string
 */
function addressToBytes32(address, label) {
  try {
    return ethers.utils.hexZeroPad(ethers.utils.getAddress(address), 32);
  } catch (err) {
    throw new Error(
      `Invalid address for "${label}" (${address}): ${err.message}`
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const network = hre.network.name;

  if (!PEER_MAP[network]) {
    throw new Error(
      `Network "${network}" is not configured in PEER_MAP.  ` +
      `Supported networks: ${Object.keys(PEER_MAP).join(", ")}`
    );
  }

  if (!OFT_ADDRESS[network]) {
    throw new Error(
      `No OFT address configured for network "${network}".  ` +
      `Update OFT_ADDRESS in this script before running.`
    );
  }

  const [signer] = await ethers.getSigners();
  console.log(`Network  : ${network}`);
  console.log(`Signer   : ${signer.address}`);

  const oft = new ethers.Contract(OFT_ADDRESS[network], OFT_ABI, signer);

  // Sanity-check: confirm the signer is the owner
  const owner = await oft.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.warn(
      `  [SKIP] Signer ${signer.address} is not the contract owner (${owner}).  ` +
      `Only the owner can call setPeer().  Skipping ${network}.`
    );
    return;
  }

  for (const remote of PEER_MAP[network]) {
    const remoteEid     = EID[remote];
    const remoteAddress = OFT_ADDRESS[remote];

    if (!remoteEid || !remoteAddress) {
      console.warn(`  [SKIP] Missing EID or address for remote "${remote}"`);
      continue;
    }

    // Check whether the peer is already set to avoid unnecessary transactions
    const currentPeer = await oft.peers(remoteEid);
    const desiredPeer = addressToBytes32(remoteAddress, remote);

    if (currentPeer.toLowerCase() === desiredPeer.toLowerCase()) {
      console.log(`  [OK]   Peer already set for ${remote} (eid=${remoteEid})`);
      continue;
    }

    console.log(`  [SET]  Setting peer for ${remote} (eid=${remoteEid}) → ${remoteAddress}`);
    try {
      const tx = await oft.setPeer(remoteEid, desiredPeer);
      console.log(`         tx: ${tx.hash}`);
      await tx.wait();
      console.log(`         confirmed ✓`);
    } catch (err) {
      console.warn(
        `  [WARN] Failed to set peer for "${remote}" (eid=${remoteEid}): ${err.message}`
      );
    }
  }

  console.log("\nAll peers configured successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
