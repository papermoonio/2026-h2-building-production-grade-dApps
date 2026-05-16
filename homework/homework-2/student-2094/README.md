# Polkadot Testnet + ethers/viem + PAPI Demo

这个示例完成了：

1. 使用 `papi` 连接 Polkadot Testnet（Westend Asset Hub）
2. EVM 地址与 SS58 地址互转
3. 使用 `ethers` 与 `viem` 查询同一地址余额并比较是否一致
4. 调用一个 precompile：`ecrecover (0x000...0001)`

## 安装

```bash
npm install
```

## 配置

复制配置文件并填写地址：

```bash
cp .env.example .env
```

至少需要设置：

- `TEST_EVM_ADDRESS`：要测试余额的一条 EVM 地址
- `TEST_PRIVATE_KEY`：可选；用于 precompile `ecrecover` 测试（不填会跳过 precompile 测试）

## 运行

```bash
npm start
```

## 输出说明

脚本会输出以下关键结果：

- `地址转换一致性: true/false`
- `余额一致性: true/false`
- `precompile 校验: true/false`（仅当提供私钥时）

## 备注

- 默认网络是 Westend Asset Hub。
- 若官方 endpoint 变更，可在 `.env` 覆盖：
  - `SUBSTRATE_WSS`
  - `EVM_RPC`
