const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. PlayerRegistry
  const PlayerRegistry = await hre.ethers.getContractFactory("PlayerRegistry");
  const registry = await PlayerRegistry.deploy();
  await registry.deployed();
  console.log("PlayerRegistry deployed to:", registry.address);

  // 2. SkillNFT
  const SkillNFT = await hre.ethers.getContractFactory("SkillNFT");
  const skillNFT = await SkillNFT.deploy();
  await skillNFT.deployed();
  console.log("SkillNFT deployed to:", skillNFT.address);

  // Seed some skill types
  await skillNFT.addSkillType("Swordsmanship", 1, hre.ethers.utils.parseEther("0.01"));
  await skillNFT.addSkillType("Magic", 3, hre.ethers.utils.parseEther("0.05"));
  await skillNFT.addSkillType("Archery", 2, hre.ethers.utils.parseEther("0.02"));
  console.log("  Seeded 3 skill types");

  // 3. HouseNFT
  const HouseNFT = await hre.ethers.getContractFactory("HouseNFT");
  const houseNFT = await HouseNFT.deploy();
  await houseNFT.deployed();
  console.log("HouseNFT deployed to:", houseNFT.address);

  // Seed some house types
  await houseNFT.addHouseType(
    "Wooden Hut",
    hre.ethers.utils.parseEther("0.1"),
    hre.ethers.utils.parseEther("0.05"),
    100,
    "ipfs://QmWoodenHut"
  );
  await houseNFT.addHouseType(
    "Stone House",
    hre.ethers.utils.parseEther("0.5"),
    hre.ethers.utils.parseEther("0.2"),
    50,
    "ipfs://QmStoneHouse"
  );
  await houseNFT.addHouseType(
    "Castle",
    hre.ethers.utils.parseEther("2.0"),
    hre.ethers.utils.parseEther("0.8"),
    10,
    "ipfs://QmCastle"
  );
  console.log("  Seeded 3 house types");

  // 4. LearningNFT
  const LearningNFT = await hre.ethers.getContractFactory("LearningNFT");
  const learningNFT = await LearningNFT.deploy();
  await learningNFT.deployed();
  console.log("LearningNFT deployed to:", learningNFT.address);

  // Seed some courses
  await learningNFT.addCourse("Blockchain Basics", "Introduction to blockchain", 0, true);
  await learningNFT.addCourse("DeFi 101", "Decentralized finance fundamentals", hre.ethers.utils.parseEther("0.01"), false);
  console.log("  Seeded 2 courses");

  // 5. VendingMachine
  const VendingMachine = await hre.ethers.getContractFactory("VendingMachine");
  const vending = await VendingMachine.deploy();
  await vending.deployed();
  console.log("VendingMachine deployed to:", vending.address);

  // Seed some food items
  await vending.addFood("Apple", hre.ethers.utils.parseEther("0.001"), 0);
  await vending.addFood("Bread", hre.ethers.utils.parseEther("0.002"), 0);
  await vending.addFood("Potion", hre.ethers.utils.parseEther("0.005"), 0);
  await vending.addFood("Elixir", hre.ethers.utils.parseEther("0.01"), 0);
  console.log("  Seeded 4 food items");

  // Print summary
  console.log("\n=== Deployment Summary ===");
  console.log("PlayerRegistry:", registry.address);
  console.log("SkillNFT:      ", skillNFT.address);
  console.log("HouseNFT:      ", houseNFT.address);
  console.log("LearningNFT:   ", learningNFT.address);
  console.log("VendingMachine:", vending.address);
  console.log("==========================");

  // Write addresses to game config
  const fs = require("fs");
  const config = {
    network: hre.network.name,
    playerRegistry: registry.address,
    skillNFT: skillNFT.address,
    houseNFT: houseNFT.address,
    learningNFT: learningNFT.address,
    vendingMachine: vending.address,
  };
  fs.writeFileSync(
    "game/contract-addresses.json",
    JSON.stringify(config, null, 2)
  );
  console.log("Contract addresses written to game/contract-addresses.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
