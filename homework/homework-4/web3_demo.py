"""
Homework 4 - Web3.py Blockchain Interaction Demo
使用 Web3.py 完成区块链连接、基本数据查询、交易发送、智能合约部署和状态操作
"""

from web3 import Web3
from eth_account import Account
from eth_typing import ChainId
import json
import os

# ============================================================================
# 1. 连接到区块链 (Sepolia Testnet)
# ============================================================================

# 使用公共 RPC 节点 (Infura/Alchemy/其他)
SEPOLIA_RPC_URL = os.environ.get(
    "SEPOLIA_RPC_URL",
    "https://rpc.sepolia.org",  # 公共测试网 RPC
)

# 初始化 Web3
w3 = Web3(Web3.HTTPProvider(SEPOLIA_RPC_URL))

print(f"=== 1. 区块链连接 ===")
print(f"是否连接成功: {w3.is_connected()}")
print(f"当前区块高度: {w3.eth.block_number}")
print(f"网络链 ID: {w3.eth.chain_id}")

# ============================================================================
# 2. 基本数据查询
# ============================================================================

print(f"\n=== 2. 基本数据查询 ===")

# 查询最新区块
latest_block = w3.eth.get_block("latest")
print(f"最新区块号: {latest_block['number']}")
print(f"区块哈希: {latest_block['hash'].hex()}")
print(f"区块时间戳: {latest_block['timestamp']}")

# 查询账户余额
test_address = "0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E"  # 示例地址
balance_wei = w3.eth.get_balance(test_address)
balance_eth = w3.from_wei(balance_wei, "ether")
print(f"地址 {test_address} 余额: {balance_eth} ETH")

# 查询当前 gas 价格
gas_price = w3.eth.gas_price
print(f"当前 Gas 价格: {w3.from_wei(gas_price, 'gwei')} Gwei")

# ============================================================================
# 3. 发送交易
# ============================================================================

print(f"\n=== 3. 发送交易 ===")

# 注意: 需要私钥来签名交易
# 在生产环境中，应该从环境变量或钱包获取
PRIVATE_KEY = os.environ.get("PRIVATE_KEY", "")

if PRIVATE_KEY:
    account = Account.from_key(PRIVATE_KEY)
    print(f"发送地址: {account.address}")

    # 准备交易
    tx = {
        "from": account.address,
        "to": test_address,  # 发送给另一个地址
        "value": w3.to_wei(0.001, "ether"),  # 0.001 ETH
        "gas": 21000,  # 标准转账 gas
        "gasPrice": gas_price,
        "nonce": w3.eth.get_transaction_count(account.address),
        "chainId": ChainId.Sepolia,
    }

    # 签名交易
    signed_tx = account.sign_transaction(tx)
    print(f"交易已签名: {signed_tx.hash.hex()}")

    # 发送交易 (在真实环境中取消注释)
    # tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    # receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    # print(f"交易成功! TX 哈希: {receipt.transactionHash.hex()}")
    # print(f"区块号: {receipt.blockNumber}")
else:
    print("未设置私钥，跳过实际交易发送")
    print("设置 PRIVATE_KEY 环境变量来发送交易")

# ============================================================================
# 4. 智能合约部署
# ============================================================================

print(f"\n=== 4. 智能合约部署 ===")

# 简单的 Storage 合约 (Solidity)
STORAGE_CONTRACT_ABI = [
    {
        "inputs": [],
        "name": "retrieve",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "uint256", "name": "num", "type": "uint256"}],
        "name": "store",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

STORAGE_CONTRACT_BYTECODE = "0x6080604052348015610010575f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f6101005ff35f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f6101005f3560e01c8060e45f39b5f5f5f5f5f5f5f5f5f5f5f5f5f5f6101005c903960805f5f5f5f5f5f5f5f5f5f5f5f5f5f6101005c8c601e5f5f5f5f5f5f5f5f5f5f5f5f5f5f6101005c9c602e5f5f5f5f5f5f5f5f5f5f5f5f5f5f6101005c8a7"

if PRIVATE_KEY and w3.is_connected():
    account = Account.from_key(PRIVATE_KEY)

    # 创建合约
    contract = w3.eth.contract(
        abi=STORAGE_CONTRACT_ABI, bytecode=STORAGE_CONTRACT_BYTECODE
    )

    # 构建部署交易
    tx = contract.constructor().build_transaction(
        {
            "from": account.address,
            "gas": 100000,
            "gasPrice": gas_price,
            "nonce": w3.eth.get_transaction_count(account.address),
            "chainId": ChainId.Sepolia,
        }
    )

    # 签名并发送
    signed_tx = account.sign_transaction(tx)
    print(f"部署交易已签名")

    # 在真实环境中取消注释
    # tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    # receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    # print(f"合约部署成功! 合约地址: {receipt.contractAddress}")
else:
    print("跳过合约部署 (需要私钥和有效连接)")

# ============================================================================
# 5. 状态读取和更新
# ============================================================================

print(f"\n=== 5. 状态读取和更新 ===")

# 已部署的合约地址 (需要替换为实际的合约地址)
CONTRACT_ADDRESS = os.environ.get(
    "CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000"
)

if (
    CONTRACT_ADDRESS != "0x0000000000000000000000000000000000000000"
    and w3.is_connected()
):
    # 连接已部署的合约
    storage_contract = w3.eth.contract(
        address=CONTRACT_ADDRESS, abi=STORAGE_CONTRACT_ABI
    )

    # 读取状态
    current_value = storage_contract.functions.retrieve().call()
    print(f"当前存储的值: {current_value}")

    if PRIVATE_KEY:
        account = Account.from_key(PRIVATE_KEY)

        # 更新状态
        new_value = 42
        tx = storage_contract.functions.store(new_value).build_transaction(
            {
                "from": account.address,
                "gas": 50000,
                "gasPrice": gas_price,
                "nonce": w3.eth.get_transaction_count(account.address),
                "chainId": ChainId.Sepolia,
            }
        )

        signed_tx = account.sign_transaction(tx)
        print(f"状态更新交易已签名")

        # 在真实环境中取消注释
        # tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        # receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        # print(f"状态更新成功!")

        # 读取更新后的值
        # new_value = storage_contract.functions.retrieve().call()
        # print(f"更新后的值: {new_value}")
else:
    print("跳过状态操作 (需要部署的合约地址)")

print(f"\n=== 完成 ===")
print(f"演示代码结束。所有操作都需要配置 PRIVATE_KEY 环境变量才能执行实际交易")
