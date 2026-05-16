# Polkadot Testnet + Uniswap V2 + EVM/PVM Demo

这个仓库包含三部分：

1. 使用 `papi` 连接 Polkadot Testnet（Westend Asset Hub）
2. 在 EVM 侧部署并测试 Uniswap V2（Factory + Router + WETH）
3. 一个 EVM 与 PVM 相互调用示例脚本

## 安装

```bash
npm install
```

## Uniswap V2（测试与部署）

### 运行测试

```bash
npm test
```

测试覆盖：

- Factory / Router / WETH 部署
- 创建 Pair 并注入流动性
- 执行一次 swap 并校验输出余额增长

### 部署到 Westend Asset Hub EVM

在 `.env` 设置：

- `EVM_RPC`
- `TESTNET_PRIVATE_KEY`（账户需有测试币）

执行：

```bash
npm run deploy:testnet
```

部署脚本会输出：

- `UniswapV2Factory` 地址
- `WETH9` 地址
- `UniswapV2Router02` 地址

## 配置

复制配置文件并填写地址：

```bash
cp .env.example .env
```

至少需要设置：

- `TEST_EVM_ADDRESS`：要测试余额的一条 EVM 地址
- `TEST_PRIVATE_KEY`：可选；用于 precompile `ecrecover` 测试（不填会跳过 precompile 测试）
- `TESTNET_PRIVATE_KEY`：用于测试网部署 Uniswap V2

EVM/PVM 相互调用示例按需设置：

- `EXAMPLE_EVM_CONTRACT`：示例读取的 EVM 合约地址（需有 `value()`）
- `PVM_DISPATCH_PRECOMPILE`：PVM 调度 precompile 地址
- `PVM_CALLDATA`：发给 precompile 的 calldata

## 运行

```bash
npm start
```

EVM/PVM 相互调用示例：

```bash
npm run cross:call
```

## 输出说明

脚本会输出以下关键结果：

- `地址转换一致性: true/false`
- `余额一致性: true/false`
- `precompile 校验: true/false`（仅当提供私钥时）

`cross:call` 会输出：

- 同一账户的 EVM 地址与 SS58 地址
- PVM -> EVM 示例读取结果（若配置了 `EXAMPLE_EVM_CONTRACT`）
- EVM -> PVM precompile 调用交易结果（若配置了 precompile 参数）

## 备注

- 默认网络是 Westend Asset Hub。
- 若官方 endpoint 变更，可在 `.env` 覆盖：
  - `SUBSTRATE_WSS`
  - `EVM_RPC`
