import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { EventRegistry, TicketMinter } from "../typechain-types";

/**
 * 测试: EVM <-> PVM 双向跨 VM 调用
 *
 * 本地环境限制: Hardhat 没有 PolkaVM 后端, 所以两个合约都会以 EVM 字节码
 * 运行。但因为 Solidity 源码是 VM-agnostic 的, 验证的调用语义、安全检查、
 * 事件顺序与真实部署到 Polkadot Hub (一个 EVM、一个 PVM) 完全一致。
 */
describe("EVM-PVM Cross-VM Interop: Ticket Booking", function () {
  let registry: EventRegistry;
  let minter: TicketMinter;
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;

  beforeEach(async () => {
    [deployer, alice, bob, attacker] = await ethers.getSigners();

    const Minter = await ethers.getContractFactory("TicketMinter");
    minter = (await Minter.deploy()) as unknown as TicketMinter;
    await minter.waitForDeployment();

    const Registry = await ethers.getContractFactory("EventRegistry");
    registry = (await Registry.deploy()) as unknown as EventRegistry;
    await registry.waitForDeployment();

    await (await registry.setMinter(await minter.getAddress())).wait();
    await (await minter.setRegistry(await registry.getAddress())).wait();
  });

  describe("初始状态", () => {
    it("registry / minter 互相绑定成功", async () => {
      expect(await registry.minter()).to.equal(await minter.getAddress());
      expect(await minter.registry()).to.equal(await registry.getAddress());
    });

    it("owner 字段正确", async () => {
      expect(await registry.owner()).to.equal(deployer.address);
      expect(await minter.owner()).to.equal(deployer.address);
    });
  });

  describe("活动管理", () => {
    it("非 owner 不能创建活动", async () => {
      await expect(
        registry.connect(alice).createEvent("Hack Night", 10)
      ).to.be.revertedWith("EventRegistry: not owner");
    });

    it("容量 0 的活动不能创建", async () => {
      await expect(registry.createEvent("Zero", 0)).to.be.revertedWith(
        "EventRegistry: zero capacity"
      );
    });

    it("创建活动会递增 id 并发出事件", async () => {
      await expect(registry.createEvent("A", 5))
        .to.emit(registry, "EventCreated")
        .withArgs(0n, "A", 5n);
      await expect(registry.createEvent("B", 8))
        .to.emit(registry, "EventCreated")
        .withArgs(1n, "B", 8n);
      expect(await registry.nextEventId()).to.equal(2n);
    });
  });

  describe("核心流程: EVM -> PVM -> EVM 回调", () => {
    beforeEach(async () => {
      await (await registry.createEvent("Polkadot Day", 3)).wait();
    });

    it("订票成功：铸造 + 回调 + 库存扣减都发生", async () => {
      await expect(registry.connect(alice).bookTicket(0))
        // EVM 侧预订请求事件
        .to.emit(registry, "BookingRequested")
        .withArgs(0n, alice.address)
        // PVM 侧铸造事件
        .to.emit(minter, "TicketMinted")
        .withArgs(1n, 0n, alice.address)
        // PVM -> EVM 回调成功后的确认事件
        .to.emit(registry, "BookingConfirmed")
        .withArgs(0n, 1n, alice.address);

      expect(await registry.remaining(0)).to.equal(2n);
      expect(await minter.totalMinted()).to.equal(1n);
      expect(await minter.ownerOfTicket(1)).to.equal(alice.address);
      expect(await minter.eventOfTicket(1)).to.equal(0n);
    });

    it("多人订票：ticketId 全局单调递增", async () => {
      await (await registry.connect(alice).bookTicket(0)).wait();
      await (await registry.connect(bob).bookTicket(0)).wait();

      expect(await minter.totalMinted()).to.equal(2n);
      expect(await minter.ownerOfTicket(1)).to.equal(alice.address);
      expect(await minter.ownerOfTicket(2)).to.equal(bob.address);
      expect(await registry.remaining(0)).to.equal(1n);
    });

    it("活动售罄后无法继续订票", async () => {
      // capacity = 3
      await (await registry.connect(alice).bookTicket(0)).wait();
      await (await registry.connect(bob).bookTicket(0)).wait();
      await (await registry.connect(deployer).bookTicket(0)).wait();

      expect(await registry.remaining(0)).to.equal(0n);
      await expect(
        registry.connect(alice).bookTicket(0)
      ).to.be.revertedWith("EventRegistry: sold out");
    });

    it("不存在的活动无法订票", async () => {
      await expect(
        registry.connect(alice).bookTicket(999)
      ).to.be.revertedWith("EventRegistry: event not found");
    });
  });

  describe("跨 VM 权限边界", () => {
    beforeEach(async () => {
      await (await registry.createEvent("Perm", 5)).wait();
    });

    it("EventRegistry.onTicketMinted 只允许已注册的 minter 调用", async () => {
      // 攻击者直接调 onTicketMinted 必须失败
      await expect(
        registry
          .connect(attacker)
          .onTicketMinted(0, 999, attacker.address)
      ).to.be.revertedWith("EventRegistry: caller is not minter");
    });

    it("TicketMinter.mintTicket 只允许已注册的 registry 调用", async () => {
      await expect(
        minter.connect(attacker).mintTicket(0, attacker.address)
      ).to.be.revertedWith("TicketMinter: caller is not registry");
    });

    it("非 owner 不能更改 minter 地址", async () => {
      await expect(
        registry.connect(attacker).setMinter(attacker.address)
      ).to.be.revertedWith("EventRegistry: not owner");
    });

    it("非 owner 不能更改 registry 地址", async () => {
      await expect(
        minter.connect(attacker).setRegistry(attacker.address)
      ).to.be.revertedWith("TicketMinter: not owner");
    });

    it("恶意 minter 回调不存在的 event 会 revert", async () => {
      // 把 registry 的 minter 指向 attacker, 再让 attacker 直接回调
      await (await registry.setMinter(attacker.address)).wait();
      await expect(
        registry
          .connect(attacker)
          .onTicketMinted(9999, 1, attacker.address)
      ).to.be.revertedWith("EventRegistry: unexpected callback");
    });
  });

  describe("事件顺序 (验证跨 VM 调用时序)", () => {
    it("BookingRequested -> TicketMinted -> BookingConfirmed 严格按序", async () => {
      await (await registry.createEvent("Order", 2)).wait();

      const tx = await registry.connect(alice).bookTicket(0);
      const receipt = await tx.wait();
      const logs = receipt!.logs;

      // 解析事件名: 按合约地址先定位来源, 再分别解析
      const registryAddr = (await registry.getAddress()).toLowerCase();
      const minterAddr = (await minter.getAddress()).toLowerCase();
      const topics: string[] = [];
      for (const log of logs) {
        const addr = log.address.toLowerCase();
        if (addr === registryAddr) {
          const parsed = registry.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed) topics.push(`registry.${parsed.name}`);
        } else if (addr === minterAddr) {
          const parsed = minter.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed) topics.push(`minter.${parsed.name}`);
        }
      }

      // 期望顺序: EVM 发起 -> PVM 铸造 -> EVM 回调确认
      expect(topics).to.deep.equal([
        "registry.BookingRequested",
        "minter.TicketMinted",
        "registry.BookingConfirmed",
      ]);
    });
  });
});
