import 'dotenv/config'
import { readFileSync } from 'node:fs'
import solc from 'solc'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量: ${name}`)
  }
  return value
}

function printFriendlyError(err) {
  const message = String(err?.message ?? err)
  if (message.includes('ECONNREFUSED') || message.includes('HTTP request failed')) {
    console.error('无法连接到 RPC 节点，请先启动本地区块链或修改 RPC_URL。')
    console.error('当前 RPC_URL =', rpcUrl)
    return
  }
  console.error(err)
}

const rpcUrl = getRequiredEnv('RPC_URL')
const privateKey = getRequiredEnv('PRIVATE_KEY')
const toAddress = getRequiredEnv('TO_ADDRESS')

const account = privateKeyToAccount(
  privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
)

const publicClient = createPublicClient({
  chain: foundry,
  transport: http(rpcUrl),
})

const walletClient = createWalletClient({
  account,
  chain: foundry,
  transport: http(rpcUrl),
})

const source = readFileSync(new URL('./Counter.sol', import.meta.url), 'utf8')

function compileContract() {
  const input = {
    language: 'Solidity',
    sources: {
      'Counter.sol': {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input)))

  if (output.errors) {
    const errors = output.errors.filter((e) => e.severity === 'error')
    if (errors.length > 0) {
      console.error(errors)
      throw new Error('Solidity 编译失败')
    }
  }

  const contract = output.contracts['Counter.sol']['Counter']
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  }
}

async function main() {
  console.log('当前账户:', account.address)

  // 基本数据查询
  const chainId = await publicClient.getChainId()
  const blockNumber = await publicClient.getBlockNumber()
  const balance = await publicClient.getBalance({ address: account.address })
  const nonce = await publicClient.getTransactionCount({ address: account.address })

  console.log('\n=== 基本数据查询 ===')
  console.log('chainId =', chainId)
  console.log('latestBlock =', blockNumber.toString())
  console.log('balance =', formatEther(balance), 'ETH')
  console.log('nonce =', nonce)

  // 发送普通交易
  console.log('\n=== 发送普通交易 ===')
  const txHash = await walletClient.sendTransaction({
    account,
    to: toAddress,
    value: parseEther('0.001'),
  })

  console.log('转账 txHash =', txHash)

  const txReceipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  })

  console.log('转账已确认, blockNumber =', txReceipt.blockNumber.toString())

  // 编译并部署合约
  console.log('\n=== 编译并部署合约 ===')
  const { abi, bytecode } = compileContract()

  const deployHash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [100n], // 初始值
    account,
  })

  console.log('部署 txHash =', deployHash)

  const deployReceipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
  })

  const contractAddress = deployReceipt.contractAddress
  if (!contractAddress) {
    throw new Error('未拿到合约地址')
  }

  console.log('合约地址 =', contractAddress)

  // 读取合约状态
  console.log('\n=== 读取合约状态 ===')
  const value1 = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: 'number',
  })

  console.log('初始 number =', value1.toString())

  // 更新合约状态：setNumber
  console.log('\n=== 更新合约状态: setNumber(999) ===')
  const writeHash1 = await walletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: 'setNumber',
    args: [999n],
    account,
  })

  console.log('setNumber txHash =', writeHash1)

  await publicClient.waitForTransactionReceipt({
    hash: writeHash1,
  })

  const value2 = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: 'number',
  })

  console.log('更新后 number =', value2.toString())

  // 再更新一次：increment
  console.log('\n=== 更新合约状态: increment() ===')
  const writeHash2 = await walletClient.writeContract({
    address: contractAddress,
    abi,
    functionName: 'increment',
    account,
  })

  console.log('increment txHash =', writeHash2)

  await publicClient.waitForTransactionReceipt({
    hash: writeHash2,
  })

  const value3 = await publicClient.readContract({
    address: contractAddress,
    abi,
    functionName: 'number',
  })

  console.log('再次读取 number =', value3.toString())
}

main().catch((err) => {
  printFriendlyError(err)
  process.exit(1)
})