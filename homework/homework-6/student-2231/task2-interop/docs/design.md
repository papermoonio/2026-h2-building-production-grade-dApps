# 设计思路笔记

> 学号: 2231 · Homework 6 Task 2

这篇记录我在设计这个 EVM-PVM 互操作例子时的思考过程，供助教参考。

## 1. 我对这道题的理解

题目原文:
> 写一个 EVM 和 PVM 相互调用的例子

关键词是 **"相互"**——说明需要体现**双向调用**，不能只是"EVM 调 PVM 就完事"。

我翻了 Polkadot 官方 [Dual VM Stack](https://docs.polkadot.com/smart-contracts/for-eth-devs/dual-vm-stack/) 文档和 [pallet_revive 源码](https://paritytech.github.io/polkadot-sdk/master/pallet_revive/)，确认了三个核心事实：

1. **同一个地址空间**：EVM 和 PVM 合约都在 `pallet_revive` 的 AccountId-20 地址空间里
2. **运行时路由**：`pallet_revive` 在执行 call 时根据目标账户的字节码类型自动选择后端（REVM 或 PolkaVM），对调用方完全透明
3. **同一套 Solidity 源码**：`solc` 产 EVM 字节码，`resolc`（revive）产 PolkaVM 字节码，**同一份 `.sol` 文件可以被两种编译器处理**

所以"跨 VM 调用"这件事在 Solidity 层面**根本没有 API**——它就是 `IContract(addr).method(...)`。区别全在**部署时**选了哪个编译器。

## 2. 为什么不做跨链桥

我看了其他几个同学的提交（1924、2185、1542、2204），发现他们都写了 AI 生成的"桥"模式：
- `EVMToPVMBridge` 锁 token，发 event
- `PVMBridgeReceiver` 监听并"铸造"
- `CrossChainSwap` 编排双向 swap

**这个方向是错的**——它把 EVM 和 PVM 当成两条独立的链在桥接，但实际上 Polkadot Hub 上它们是同一条链的两个后端。写桥就相当于在自家客厅里架了座桥到厨房——概念上冗余，代码上复杂。

## 3. 我的选型：票务预订

为什么选这个场景:

| 设计目标 | 这个场景如何满足 |
|---|---|
| 体现双向调用 | 用户发起订票是 EVM→PVM，铸票成功后 PVM→EVM 回调扣库存 |
| 简单易懂 | 活动、票、库存，助教一眼能看明白 |
| 职责分离 | 业务逻辑（EVM）和数据记账（PVM）天然分工 |
| 符合 Polkadot 的设计哲学 | 没有假装跨链，就是在共享地址空间里互相调用 |

一个更现实的类比：**大型系统常见的"API 层 + 数据层"分离**。EventRegistry 像 API 层，TicketMinter 像数据层，开发者可以独立选择每层的最优 VM。

## 4. 为什么不直接用 external call 而要绕一个回调

```
为什么不做成这样 (只有单向):
   user -> EventRegistry.bookTicket()
     -> TicketMinter.mintTicket()  // 返回 ticketId
     -> EventRegistry 直接在 bookTicket 里扣库存
```

这样确实能工作，但**只体现了一个方向**的跨 VM 调用。为了真正演示"相互"，我让：

- `mintTicket` 在铸造完成后**主动反向调用** `registry.onTicketMinted(...)`
- registry 再做扣库存 + 发 `BookingConfirmed` 事件

这样一笔 `bookTicket` 交易触发了 **3 次跨 VM 边界**:
1. 用户 EOA → EVM (进入 registry)
2. EVM → PVM (调 mintTicket)
3. PVM → EVM (回调 onTicketMinted)

## 5. 安全陷阱与对策

反向回调是强大的模式，但也开了攻击面，我处理了三类风险：

### 5.1 未授权合约伪装 minter
如果 `onTicketMinted` 是 public 的，任何人都能调它白嫖库存扣减。
→ 加 `onlyMinter` modifier 校验 `msg.sender == address(minter)`。

### 5.2 授权 minter 的错误调用
即便是绑定的 minter，也可能 bug 导致在非 bookTicket 流程中调 onTicketMinted。
→ 引入 `pendingBooker[eventId]` 上下文标记：bookTicket 开始时标记，调用回来的 buyer 必须和标记匹配。

### 5.3 恶意重新绑定
如果 attacker 能调 `setMinter` 把指针改到自己的合约，就能绕过前两道防线。
→ `setMinter` 加 `onlyOwner`，部署后一般只设置一次。

## 6. 本地 Hardhat 测试的局限与价值

**局限**: Hardhat 不支持 PolkaVM 后端，所以测试时两个合约都是 EVM 字节码。严格意义上这不是"真的跨 VM"。

**为什么测试依然有价值**:
1. Solidity 源码是 VM-agnostic 的，语义上两种后端下行为应该一致
2. 我们验证的是**调用流程、权限边界、事件顺序**——这些在两个后端里都是一样的
3. 真正需要跨 VM 验证的是 ABI 编解码一致性，而 revive 编译器的设计目标就是保证这一点

实际部署到 Polkadot Hub TestNet 的步骤写在 README 的 **"部署到 Polkadot Hub TestNet 的方式"** 章节。

## 7. 我在完成过程中的学习收获

- **地址空间共享**是 Polkadot Hub 的 killer feature，比传统 L1+rollup 的异步通信模式更简单
- **回调模式要配合权限 + 上下文校验**才安全，不是加个 `onlyRole` 就万事大吉
- 事件按顺序出现这件事本身就是很好的集成测试断言——不仅验证了状态，还验证了**时序**

## 8. 下一步可以做的扩展

如果时间充裕，还可以：
- 把 TicketMinter 升级成 ERC-721，让票可以转让
- 在 PVM 侧用 RISC-V 向量指令加速批量铸造（PolkaVM 的性能优势）
- 加 resolc 编译管线到 CI，把"混合后端部署"做成自动化脚本
