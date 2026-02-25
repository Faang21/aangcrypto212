const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PlayerRegistry", function () {
  let registry, owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const PlayerRegistry = await ethers.getContractFactory("PlayerRegistry");
    registry = await PlayerRegistry.deploy();
    await registry.deployed();
  });

  it("allows a wallet to set a nickname", async () => {
    await registry.connect(alice).setNickname("AlicePixel");
    expect(await registry.getNickname(alice.address)).to.equal("AlicePixel");
  });

  it("prevents duplicate nicknames (case-insensitive)", async () => {
    await registry.connect(alice).setNickname("AlicePixel");
    await expect(registry.connect(bob).setNickname("alicepixel")).to.be.revertedWith("Nickname already taken");
  });

  it("allows updating own nickname and frees the old one", async () => {
    await registry.connect(alice).setNickname("AlicePixel");
    await registry.connect(alice).setNickname("AliceNew");
    // Old nickname should be free now
    await registry.connect(bob).setNickname("AlicePixel");
    expect(await registry.getNickname(bob.address)).to.equal("AlicePixel");
  });

  it("rejects invalid characters", async () => {
    await expect(registry.connect(alice).setNickname("Alice!")).to.be.revertedWith("Invalid character");
  });

  it("rejects empty nickname", async () => {
    await expect(registry.connect(alice).setNickname("")).to.be.revertedWith("Nickname length invalid");
  });

  it("resolves wallet from nickname", async () => {
    await registry.connect(alice).setNickname("AlicePixel");
    expect(await registry.getWalletByNickname("alicepixel")).to.equal(alice.address);
  });
});

describe("SkillNFT", function () {
  let skillNFT, owner, player;

  beforeEach(async () => {
    [owner, player] = await ethers.getSigners();
    const SkillNFT = await ethers.getContractFactory("SkillNFT");
    skillNFT = await SkillNFT.deploy();
    await skillNFT.deployed();
    await skillNFT.addSkillType("Swordsmanship", 1, ethers.utils.parseEther("0.01"));
  });

  it("grants a skill to a player (admin)", async () => {
    await skillNFT.grantSkill(player.address, 0, "ipfs://QmSkill0");
    expect(await skillNFT.hasSkill(player.address, 0)).to.be.true;
    expect(await skillNFT.ownerOf(0)).to.equal(player.address);
  });

  it("allows purchasing a skill", async () => {
    await skillNFT.connect(player).purchaseSkill(0, "ipfs://QmSkill0", {
      value: ethers.utils.parseEther("0.01"),
    });
    expect(await skillNFT.hasSkill(player.address, 0)).to.be.true;
  });

  it("prevents buying the same skill twice", async () => {
    await skillNFT.connect(player).purchaseSkill(0, "ipfs://QmSkill0", {
      value: ethers.utils.parseEther("0.01"),
    });
    await expect(
      skillNFT.connect(player).purchaseSkill(0, "ipfs://QmSkill0", {
        value: ethers.utils.parseEther("0.01"),
      })
    ).to.be.revertedWith("Already owned");
  });

  it("rejects incorrect payment", async () => {
    await expect(
      skillNFT.connect(player).purchaseSkill(0, "ipfs://QmSkill0", {
        value: ethers.utils.parseEther("0.001"),
      })
    ).to.be.revertedWith("Incorrect payment");
  });
});

describe("HouseNFT", function () {
  let houseNFT, owner, buyer, buyer2;
  const buyPrice = ethers.utils.parseEther("0.1");
  const sellPrice = ethers.utils.parseEther("0.05");

  beforeEach(async () => {
    [owner, buyer, buyer2] = await ethers.getSigners();
    const HouseNFT = await ethers.getContractFactory("HouseNFT");
    houseNFT = await HouseNFT.deploy();
    await houseNFT.deployed();
    await houseNFT.addHouseType("Wooden Hut", buyPrice, sellPrice, 100, "ipfs://QmHouse");
    // Fund treasury so buybacks work
    await owner.sendTransaction({ to: houseNFT.address, value: ethers.utils.parseEther("10") });
  });

  it("allows buying a house from the market", async () => {
    await houseNFT.connect(buyer).buyFromMarket(0, "ipfs://QmHouse0", { value: buyPrice });
    expect(await houseNFT.ownerOf(0)).to.equal(buyer.address);
  });

  it("rejects incorrect payment", async () => {
    await expect(
      houseNFT.connect(buyer).buyFromMarket(0, "ipfs://QmHouse0", { value: ethers.utils.parseEther("0.05") })
    ).to.be.revertedWith("Incorrect payment");
  });

  it("allows selling house back at lower price", async () => {
    await houseNFT.connect(buyer).buyFromMarket(0, "ipfs://QmHouse0", { value: buyPrice });
    const balBefore = await buyer.getBalance();
    const tx = await houseNFT.connect(buyer).sellToMarket(0);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed.mul(tx.gasPrice);
    const balAfter = await buyer.getBalance();
    expect(balAfter.sub(balBefore).add(gasUsed)).to.equal(sellPrice);
  });

  it("allows player-to-player listing and purchase", async () => {
    await houseNFT.connect(buyer).buyFromMarket(0, "ipfs://QmHouse0", { value: buyPrice });
    await houseNFT.connect(buyer).listHouse(0, ethers.utils.parseEther("0.08"));
    await houseNFT.connect(buyer2).buyFromPlayer(0, { value: ethers.utils.parseEther("0.08") });
    expect(await houseNFT.ownerOf(0)).to.equal(buyer2.address);
  });
});

describe("VendingMachine", function () {
  let vending, owner, player;
  const applePrice = ethers.utils.parseEther("0.001");

  beforeEach(async () => {
    [owner, player] = await ethers.getSigners();
    const VendingMachine = await ethers.getContractFactory("VendingMachine");
    vending = await VendingMachine.deploy();
    await vending.deployed();
    await vending.addFood("Apple", applePrice, 0);
  });

  it("allows buying food", async () => {
    await vending.connect(player).buyFood(0, 2, { value: applePrice.mul(2) });
    const history = await vending.getPurchaseHistory(player.address);
    expect(history.length).to.equal(1);
    expect(history[0].quantity).to.equal(2);
  });

  it("rejects incorrect payment", async () => {
    await expect(
      vending.connect(player).buyFood(0, 1, { value: ethers.utils.parseEther("0.0001") })
    ).to.be.revertedWith("Incorrect payment");
  });

  it("tracks total revenue", async () => {
    await vending.connect(player).buyFood(0, 3, { value: applePrice.mul(3) });
    expect(await vending.totalRevenue()).to.equal(applePrice.mul(3));
  });
});

describe("LearningNFT", function () {
  let learningNFT, owner, student;

  beforeEach(async () => {
    [owner, student] = await ethers.getSigners();
    const LearningNFT = await ethers.getContractFactory("LearningNFT");
    learningNFT = await LearningNFT.deploy();
    await learningNFT.deployed();
    await learningNFT.addCourse("Blockchain Basics", "Intro", 0, true);
  });

  it("grants a certificate on course completion", async () => {
    await learningNFT.completeCourse(student.address, 0, "ipfs://QmCert0");
    expect(await learningNFT.completed(student.address, 0)).to.be.true;
    expect(await learningNFT.ownerOf(0)).to.equal(student.address);
  });

  it("prevents completing the same course twice", async () => {
    await learningNFT.completeCourse(student.address, 0, "ipfs://QmCert0");
    await expect(
      learningNFT.completeCourse(student.address, 0, "ipfs://QmCert0")
    ).to.be.revertedWith("Already completed");
  });

  it("blocks transfer of soulbound certificates", async () => {
    const [, , other] = await ethers.getSigners();
    await learningNFT.completeCourse(student.address, 0, "ipfs://QmCert0");
    await expect(
      learningNFT.connect(student).transferFrom(student.address, other.address, 0)
    ).to.be.revertedWith("soulbound");
  });
});
