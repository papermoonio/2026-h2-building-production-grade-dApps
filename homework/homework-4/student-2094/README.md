# Viem 区块链操作示例

这个项目使用 `viem` 完成以下操作：

- 连接区块链节点
- 基本数据查询（chainId、区块号、余额、nonce）
- 发送普通转账交易
- 编译并部署智能合约 `Counter`
- 读取和更新合约状态（`number`、`setNumber`、`increment`）

## 1. 安装依赖

```bash
npm install
```

## 2. 配置环境变量

复制示例文件：

```bash
copy .env.example .env
```

然后编辑 `.env`：

```env
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=你的测试私钥
TO_ADDRESS=收款地址
```

建议使用本地测试链（如 Anvil/Hardhat）提供的测试私钥。

## 3. 只读验证（不发交易）

```bash
npm run query
```

该命令会输出：账户地址、`chainId`、最新区块、余额、`nonce`。

## 4. 完整流程验证（会发交易并部署合约）

```bash
npm start
```

该命令会执行：

1. 基本查询
2. 普通转账
3. 合约编译与部署
4. 合约状态读取
5. `setNumber(999)` 更新
6. `increment()` 更新并再次读取

## 5. 语法检查

```bash
npm run check
```

## 安全提示

- 不要把真实主网私钥写入 `.env`。
- 不要提交 `.env` 到仓库（已在 `.gitignore` 中忽略）。
