# Homework 6 - Task 2: EVM & PVM 跨 VM 互操作示例 (Student 2231)

**场景：** 一个去中心化活动票务预订系统。`EventRegistry` 运行在 **EVM**（REVM 后端）负责业务逻辑和库存，`TicketMinter` 运行在 **PVM**（PolkaVM 后端）负责实际铸造票据。两者通过标准 Solidity 外部调用互相触发，形成 **EVM → PVM → EVM** 的双向回调。

---

## 为什么选这个场景

看过其他同学的提交后发现大部分都采用"跨链桥"模式（锁定 / 铸造 / 消息转发）。这其实不太贴合 Polkadot Hub 的设计思路——**EVM 和 PVM 在同一条链、同一个地址空间里共存**，互相调用就是普通的 Solidity external call，根本不需要"桥"。

我希望用一个更贴合实际、更能体现 `pallet_revive` 核心能力的例子：

| 对比项 | 其他同学的桥模式 | 本项目的票务系统 |
|---|---|---|
| 主题 | 锁 token、发消息、解锁 | 业务编排：主合约调工作合约 |
| 方向 | EVM→PVM 单向，配事件触发 | **EVM↔PVM 双向回调** |
| 合约数 | 3 个（桥源、桥目标、交换器） | 2 个（职责清晰） |
| 概念准确性 | 把 EVM/PVM 当成两条独立链 | 强调共享地址空间 + 运行时路由 |

---

## 核心设计

```
┌──────────────────┐   bookTicket(eventId)   ┌──────────────────┐
│    User (EOA)    │ ──────────────────────► │  EventRegistry   │ (EVM)
└──────────────────┘                         │  + 活动/库存管理  │
                                             │  + 订票入口       │
                                             └────────┬─────────┘
                                                      │ 1. 调用 PVM
                                                      ▼
                                             ┌──────────────────┐
                                             │   TicketMinter   │ (PVM)
                                             │  + ticketId 计数器│
                                             │  + 铸造记录       │
                                             └────────┬─────────┘
                                                      │ 2. 反向回调 EVM
                                                      ▼
                                      registry.onTicketMinted(...)
                                      → 扣减库存、发 BookingConfirmed
```

**一次 `bookTicket` 交易会发出 3 个事件（严格按序）**：
1. `registry.BookingRequested` — EVM 接到订票请求
2. `minter.TicketMinted` — PVM 铸造完成
3. `registry.BookingConfirmed` — PVM 回调 EVM 后的确认

这个顺序在测试里有专门的用例验证。

---

## 为什么这就是"跨 VM 调用"

关键理解：**Polkadot Hub 的 `pallet_revive` 为 EVM 和 PVM 共享同一个 20 字节地址空间**。

- `solc` 把 Solidity 编译成 EVM 字节码，部署后由 REVM 后端执行
- `resolc`（revive）把同一份 Solidity 编译成 PolkaVM 字节码，部署后由 PolkaVM 后端执行
- 运行时 `pallet_revive` 拿到目标地址后，根据字节码类型自动路由到对应后端

**从 Solidity 开发者角度看，`minter.mintTicket(...)` 就是一次普通的 external call**——不需要任何桥、消息格式、或者额外 API。跨 VM 边界由链运行时负责，代码层完全透明。

这是 Polkadot Hub 比传统多链桥优雅的地方：同一个 dApp 可以混用两种 VM 的字节码来获得"REVM 的完全兼容 + PolkaVM 的高性能"——[官方 Dual VM Stack 文档](https://docs.polkadot.com/smart-contracts/for-eth-devs/dual-vm-stack/) 也是这么解释的。

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 编译 (生成 EVM 字节码 + TypeChain 类型)
npx hardhat compile

# 3. 跑测试
npx hardhat test

# 4. 本地部署演示
npx hardhat run scripts/deploy.ts
```

本地实测结果（Windows / Node 22.15.0）：

```
EVM-PVM Cross-VM Interop: Ticket Booking
  初始状态
    √ registry / minter 互相绑定成功
    √ owner 字段正确
  活动管理
    √ 非 owner 不能创建活动
    √ 容量 0 的活动不能创建
    √ 创建活动会递增 id 并发出事件
  核心流程: EVM -> PVM -> EVM 回调
    √ 订票成功：铸造 + 回调 + 库存扣减都发生
    √ 多人订票：ticketId 全局单调递增
    √ 活动售罄后无法继续订票
    √ 不存在的活动无法订票
  跨 VM 权限边界
    √ EventRegistry.onTicketMinted 只允许已注册的 minter 调用
    √ TicketMinter.mintTicket 只允许已注册的 registry 调用
    √ 非 owner 不能更改 minter 地址
    √ 非 owner 不能更改 registry 地址
    √ 恶意 minter 回调不存在的 event 会 revert
  事件顺序 (验证跨 VM 调用时序)
    √ BookingRequested -> TicketMinted -> BookingConfirmed 严格按序

15 passing (792ms)
```

---

## 目录结构

```
task2-interop/
├── contracts/
│   ├── IEventRegistry.sol   # EVM 回调接口 (PVM 侧会调用)
│   ├── ITicketMinter.sol    # PVM 铸造接口 (EVM 侧会调用)
│   ├── EventRegistry.sol    # 主合约 (EVM)
│   └── TicketMinter.sol     # 铸造合约 (PVM)
├── scripts/
│   └── deploy.ts            # 部署 + 演示订票
├── test/
│   └── CrossVMInterop.test.ts   # 15 个用例
├── hardhat.config.ts
├── package.json
└── tsconfig.json
```

---

## 部署到 Polkadot Hub TestNet 的方式（真实跨 VM）

本地 Hardhat 没有 PolkaVM 后端，所以两份合约都会作为 EVM 字节码执行。要在真实的 Polkadot Hub TestNet 上获得"一个 EVM + 一个 PVM"的部署形态，需要：

1. **部署 EventRegistry（EVM）**：直接用标准 Hardhat + solc 输出的字节码，通过 `polkadotTestnet` 网络部署
   ```bash
   npx hardhat vars set TESTNET_PRIVATE_KEY
   npx hardhat run scripts/deploy.ts --network polkadotTestnet
   ```
2. **部署 TicketMinter（PVM）**：用 [resolc](https://github.com/paritytech/revive) 编译 `TicketMinter.sol`
   ```bash
   # 伪代码：实际步骤依 resolc 工具链版本而定
   resolc --bin contracts/TicketMinter.sol -o artifacts-pvm/
   # 然后用 polkadot-js 或 Remix-Polkadot 部署 artifacts-pvm/TicketMinter.polkavm
   ```
3. **互相绑定地址**：在 EVM 合约上调 `setMinter(pvmAddress)`，在 PVM 合约上调 `setRegistry(evmAddress)`。

调用流程完全相同——用户用普通 EVM 钱包发 `bookTicket` 就能触发 EVM→PVM→EVM 的全链路。

---

## 设计要点 & 安全性考虑

- **双向权限隔离**：`EventRegistry.onTicketMinted` 用 `onlyMinter` 只允许绑定的 PVM 合约调用；`TicketMinter.mintTicket` 用 `onlyRegistry` 只允许绑定的 EVM 合约调用。
- **回调上下文校验**：`onTicketMinted` 里检查 `pendingBooker[eventId] == buyer`，防止恶意/错误 minter 在非预期时机回调篡改库存。
- **单调票号**：`totalMinted` 严格递增，天然防止 ticketId 冲突。
- **不依赖事件作为信任源**：所有状态变更由合约调用直接完成，事件只做审计日志用（这也是比桥模式更安全的点）。

---

## 学号

**2231**

## 参考资料

- [Polkadot Cookbook - Dual Virtual Machine Stack](https://docs.polkadot.com/smart-contracts/for-eth-devs/dual-vm-stack/)
- [pallet_revive 源码](https://paritytech.github.io/polkadot-sdk/master/pallet_revive/index.html)
- [revive (resolc) - Solidity → PolkaVM 编译器](https://github.com/paritytech/revive)
