import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { BlindDropRegistry, MockAirdrop, MockNonAirdrop } from "../typechain-types";

const ZERO_ADDRESS = ethers.ZeroAddress;

describe("BlindDropRegistry", () => {
  async function deployFixture() {
    const [admin, other, thirdParty, tokenA, tokenB] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("BlindDropRegistry");
    const registry = (await Registry.deploy()) as unknown as BlindDropRegistry;

    const MockAirdropFactory = await ethers.getContractFactory("MockAirdrop");
    const mockAirdrop = (await MockAirdropFactory.deploy(admin.address)) as unknown as MockAirdrop;

    const MockNonAirdropFactory = await ethers.getContractFactory("MockNonAirdrop");
    const mockNonAirdrop = (await MockNonAirdropFactory.deploy()) as unknown as MockNonAirdrop;

    return { registry, mockAirdrop, mockNonAirdrop, admin, other, thirdParty, tokenA, tokenB };
  }

  describe("registerCampaign — happy path", () => {
    it("registers a campaign administered by the caller", async () => {
      const { registry, mockAirdrop, admin, tokenA } = await loadFixture(deployFixture);

      await expect(
        registry.connect(admin).registerCampaign(await mockAirdrop.getAddress(), tokenA.address)
      ).to.not.be.reverted;

      expect(await registry.campaignCount()).to.equal(1n);
    });

    it("stores the campaign, token, registrar, and a timestamp", async () => {
      const { registry, mockAirdrop, admin, tokenA } = await loadFixture(deployFixture);
      const campaignAddr = await mockAirdrop.getAddress();

      const tx = await registry.connect(admin).registerCampaign(campaignAddr, tokenA.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      const record = await registry.campaignAt(0);
      expect(record.campaign).to.equal(campaignAddr);
      expect(record.token).to.equal(tokenA.address);
      expect(record.registrar).to.equal(admin.address);
      expect(record.timestamp).to.equal(BigInt(block!.timestamp));
    });

    it("emits CampaignRegistered with the correct arguments", async () => {
      const { registry, mockAirdrop, admin, tokenA } = await loadFixture(deployFixture);
      const campaignAddr = await mockAirdrop.getAddress();

      const tx = await registry.connect(admin).registerCampaign(campaignAddr, tokenA.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(registry, "CampaignRegistered")
        .withArgs(campaignAddr, tokenA.address, admin.address, block!.timestamp);
    });

    it("allows registration when the target contract has no admin-role getters (fallback path)", async () => {
      const { registry, mockNonAirdrop, other, tokenA } = await loadFixture(deployFixture);

      await expect(
        registry.connect(other).registerCampaign(await mockNonAirdrop.getAddress(), tokenA.address)
      ).to.not.be.reverted;

      const record = await registry.campaignAt(0);
      expect(record.registrar).to.equal(other.address);
    });
  });

  describe("registerCampaign — reverts", () => {
    it("reverts with CampaignAlreadyRegistered on a duplicate campaign address", async () => {
      const { registry, mockAirdrop, admin, tokenA, tokenB } = await loadFixture(deployFixture);
      const campaignAddr = await mockAirdrop.getAddress();

      await registry.connect(admin).registerCampaign(campaignAddr, tokenA.address);

      await expect(
        registry.connect(admin).registerCampaign(campaignAddr, tokenB.address)
      ).to.be.revertedWithCustomError(registry, "CampaignAlreadyRegistered");
    });

    it("reverts with CampaignAlreadyRegistered even if a different account attempts the dupe", async () => {
      const { registry, mockAirdrop, admin, other, tokenA } = await loadFixture(deployFixture);
      const campaignAddr = await mockAirdrop.getAddress();

      await registry.connect(admin).registerCampaign(campaignAddr, tokenA.address);

      await expect(
        registry.connect(other).registerCampaign(campaignAddr, tokenA.address)
      ).to.be.revertedWithCustomError(registry, "CampaignAlreadyRegistered");
    });

    it("reverts with ZeroAddress when campaign is the zero address", async () => {
      const { registry, admin, tokenA } = await loadFixture(deployFixture);

      await expect(
        registry.connect(admin).registerCampaign(ZERO_ADDRESS, tokenA.address)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("reverts with ZeroAddress when token is the zero address", async () => {
      const { registry, mockAirdrop, admin } = await loadFixture(deployFixture);

      await expect(
        registry.connect(admin).registerCampaign(await mockAirdrop.getAddress(), ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("reverts with ZeroAddress when both campaign and token are zero", async () => {
      const { registry, admin } = await loadFixture(deployFixture);

      await expect(
        registry.connect(admin).registerCampaign(ZERO_ADDRESS, ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("reverts with NotCampaignAdmin when caller does not hold the admin role", async () => {
      const { registry, mockAirdrop, other, tokenA } = await loadFixture(deployFixture);

      await expect(
        registry.connect(other).registerCampaign(await mockAirdrop.getAddress(), tokenA.address)
      ).to.be.revertedWithCustomError(registry, "NotCampaignAdmin");
    });

    it("does not register a campaign on a reverted NotCampaignAdmin call", async () => {
      const { registry, mockAirdrop, other, tokenA } = await loadFixture(deployFixture);

      await expect(
        registry.connect(other).registerCampaign(await mockAirdrop.getAddress(), tokenA.address)
      ).to.be.reverted;

      expect(await registry.campaignCount()).to.equal(0n);
    });
  });

  describe("indexing — multi-campaign, per-registrar", () => {
    it("indexes multiple campaigns registered by the same registrar in order", async () => {
      const { registry, admin, tokenA, tokenB } = await loadFixture(deployFixture);

      const MockAirdropFactory = await ethers.getContractFactory("MockAirdrop");
      const airdrop1 = await MockAirdropFactory.deploy(admin.address);
      const airdrop2 = await MockAirdropFactory.deploy(admin.address);

      await registry.connect(admin).registerCampaign(await airdrop1.getAddress(), tokenA.address);
      await registry.connect(admin).registerCampaign(await airdrop2.getAddress(), tokenB.address);

      const campaigns = await registry.campaignsOf(admin.address);
      expect(campaigns).to.deep.equal([
        await airdrop1.getAddress(),
        await airdrop2.getAddress(),
      ]);
    });

    it("keeps each registrar's campaigns separate from other registrars", async () => {
      const { registry, mockAirdrop, mockNonAirdrop, admin, other, tokenA, tokenB } =
        await loadFixture(deployFixture);

      await registry
        .connect(admin)
        .registerCampaign(await mockAirdrop.getAddress(), tokenA.address);
      await registry
        .connect(other)
        .registerCampaign(await mockNonAirdrop.getAddress(), tokenB.address);

      expect(await registry.campaignsOf(admin.address)).to.deep.equal([
        await mockAirdrop.getAddress(),
      ]);
      expect(await registry.campaignsOf(other.address)).to.deep.equal([
        await mockNonAirdrop.getAddress(),
      ]);
    });

    it("returns an empty array for a registrar with no campaigns", async () => {
      const { registry, thirdParty } = await loadFixture(deployFixture);

      expect(await registry.campaignsOf(thirdParty.address)).to.deep.equal([]);
    });

    it("increments campaignCount across registrars", async () => {
      const { registry, mockAirdrop, mockNonAirdrop, admin, other, tokenA, tokenB } =
        await loadFixture(deployFixture);

      await registry
        .connect(admin)
        .registerCampaign(await mockAirdrop.getAddress(), tokenA.address);
      expect(await registry.campaignCount()).to.equal(1n);

      await registry
        .connect(other)
        .registerCampaign(await mockNonAirdrop.getAddress(), tokenB.address);
      expect(await registry.campaignCount()).to.equal(2n);
    });
  });

  describe("campaignAt", () => {
    it("reverts with IndexOutOfRange for an index beyond the current count", async () => {
      const { registry } = await loadFixture(deployFixture);

      await expect(registry.campaignAt(0)).to.be.revertedWithCustomError(
        registry,
        "IndexOutOfRange"
      );
    });

    it("returns the correct record for a valid index", async () => {
      const { registry, mockAirdrop, admin, tokenA } = await loadFixture(deployFixture);
      const campaignAddr = await mockAirdrop.getAddress();

      await registry.connect(admin).registerCampaign(campaignAddr, tokenA.address);

      const record = await registry.campaignAt(0);
      expect(record.campaign).to.equal(campaignAddr);
    });
  });

  describe("campaignsSlice — pagination", () => {
    async function seedThree() {
      const fixture = await deployFixture();
      const { registry, admin, tokenA } = fixture;

      const MockAirdropFactory = await ethers.getContractFactory("MockAirdrop");
      const airdrops = [];
      for (let i = 0; i < 3; i++) {
        const airdrop = await MockAirdropFactory.deploy(admin.address);
        airdrops.push(await airdrop.getAddress());
        await registry.connect(admin).registerCampaign(await airdrop.getAddress(), tokenA.address);
      }

      return { ...fixture, airdrops };
    }

    it("returns an empty array when the registry is empty", async () => {
      const { registry } = await loadFixture(deployFixture);

      const slice = await registry.campaignsSlice(0, 0);
      expect(slice.length).to.equal(0);
    });

    it("returns a correctly ordered slice within bounds", async () => {
      const { registry, airdrops } = await loadFixture(seedThree);

      const slice = await registry.campaignsSlice(0, 2);
      expect(slice.length).to.equal(2);
      expect(slice[0].campaign).to.equal(airdrops[0]);
      expect(slice[1].campaign).to.equal(airdrops[1]);
    });

    it("clamps `to` beyond campaignCount instead of reverting", async () => {
      const { registry, airdrops } = await loadFixture(seedThree);

      const slice = await registry.campaignsSlice(1, 1000);
      expect(slice.length).to.equal(2);
      expect(slice[0].campaign).to.equal(airdrops[1]);
      expect(slice[1].campaign).to.equal(airdrops[2]);
    });

    it("reverts with IndexOutOfRange when `from` is beyond campaignCount", async () => {
      const { registry } = await loadFixture(seedThree);

      await expect(registry.campaignsSlice(10, 20)).to.be.revertedWithCustomError(
        registry,
        "IndexOutOfRange"
      );
    });

    it("reverts with InvalidRange when from > to", async () => {
      const { registry } = await loadFixture(seedThree);

      await expect(registry.campaignsSlice(2, 1)).to.be.revertedWithCustomError(
        registry,
        "InvalidRange"
      );
    });

    it("returns an empty slice when from === to within bounds", async () => {
      const { registry } = await loadFixture(seedThree);

      const slice = await registry.campaignsSlice(1, 1);
      expect(slice.length).to.equal(0);
    });

    it("returns the full set when to is exactly campaignCount", async () => {
      const { registry, airdrops } = await loadFixture(seedThree);

      const slice = await registry.campaignsSlice(0, 3);
      expect(slice.length).to.equal(3);
      expect(slice.map((r) => r.campaign)).to.deep.equal(airdrops);
    });
  });
});
