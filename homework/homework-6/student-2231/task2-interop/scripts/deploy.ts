import { ethers } from "hardhat";

/**
 * 部署脚本：EVM-PVM 互操作示例
 *
 * 步骤:
 *   1. 部署 TicketMinter   (意图 PVM 后端)
 *   2. 部署 EventRegistry  (意图 EVM 后端)
 *   3. 互相绑定地址
 *   4. 创建一个示例活动，并演示一次订票
 *
 * 注意: 本脚本在本地 Hardhat 网络上两个合约都作为 EVM 字节码执行——
 *       这是为了验证 Solidity 逻辑本身。
 *       在真实的 Polkadot Hub TestNet 上，应该用 resolc 先把 TicketMinter
 *       编译为 PolkaVM 字节码再部署，EventRegistry 保持 solc 产物。
 */
async function main() {
  const [deployer, alice, bob] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);

  // 1. 部署 TicketMinter (PVM)
  const TicketMinter = await ethers.getContractFactory("TicketMinter");
  const minter = await TicketMinter.deploy();
  await minter.waitForDeployment();
  console.log("TicketMinter (PVM) deployed to:", await minter.getAddress());

  // 2. 部署 EventRegistry (EVM)
  const EventRegistry = await ethers.getContractFactory("EventRegistry");
  const registry = await EventRegistry.deploy();
  await registry.waitForDeployment();
  console.log("EventRegistry (EVM) deployed to:", await registry.getAddress());

  // 3. 互相绑定
  await (await registry.setMinter(await minter.getAddress())).wait();
  await (await minter.setRegistry(await registry.getAddress())).wait();
  console.log("Cross-VM references wired up.");

  // 4. 创建活动
  const createTx = await registry.createEvent("Polkadot Hackathon 2026", 100);
  await createTx.wait();
  const eventId = 0n;
  console.log(`Created event #${eventId} with capacity 100.`);

  // 5. 演示一次订票: alice -> EVM -> PVM -> EVM 回调
  const bookTx = await registry.connect(alice).bookTicket(eventId);
  const receipt = await bookTx.wait();
  console.log(`Alice booked a ticket, tx gas used: ${receipt?.gasUsed.toString()}`);

  const ticketId = await minter.totalMinted();
  const owner = await minter.ownerOfTicket(ticketId);
  const remaining = await registry.remaining(eventId);
  console.log(`Ticket #${ticketId} owner = ${owner}`);
  console.log(`Remaining seats = ${remaining}`);

  // 简单比对
  if (owner !== alice.address) throw new Error("owner mismatch");
  if (remaining !== 99n) throw new Error("remaining mismatch");

  console.log("\nCross-VM deployment & booking flow verified.");
  void bob; // bob 只是留作扩展，避免 TS 警告
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
