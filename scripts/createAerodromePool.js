const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Creating Aerodrome Pool on Base with account:", deployer.address);

  const MOGA = "0x83296cbE860C2471f2ae3E75Ab8e99Cc2B7434e3";
  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const FACTORY_ADDRESS = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

  console.log("Approving tokens to factory with high gas price...");

  const moga = await hre.ethers.getContractAt("IERC20", MOGA);
  const usdc = await hre.ethers.getContractAt("IERC20", USDC);

  const MAX = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

  const gasPrice = 10000000000; // 10 Gwei

  console.log("Approving MOGA...");
  const approveMoga = await moga.approve(FACTORY_ADDRESS, MAX, {
    gasPrice: gasPrice,
    gasLimit: 300000
  });
  await approveMoga.wait();
  console.log("✅ MOGA approved");

  console.log("Approving USDC...");
  const approveUsdc = await usdc.approve(FACTORY_ADDRESS, MAX, {
    gasPrice: gasPrice,
    gasLimit: 300000
  });
  await approveUsdc.wait();
  console.log("✅ USDC approved");

  console.log("Creating volatile pool MOGA/USDC on Aerodrome...");

  const factory = await hre.ethers.getContractAt([
    "function getPair(address tokenA, address tokenB, bool stable) external view returns (address)",
    "function createPair(address tokenA, address tokenB, bool stable) external returns (address)"
  ], FACTORY_ADDRESS);

  try {
    const tx = await factory.createPair(MOGA, USDC, false, {
      gasPrice: gasPrice,
      gasLimit: 600000
    });

    await tx.wait();

    console.log("✅ Aerodrome Pool MOGA/USDC berhasil dibuat di Base!");
    console.log("Transaction hash:", tx.hash);

    const poolAddress = await factory.getPair(MOGA, USDC, false);
    console.log("Pool Address:", poolAddress);
  } catch (error) {
    console.error("❌ Gagal membuat pool:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });
