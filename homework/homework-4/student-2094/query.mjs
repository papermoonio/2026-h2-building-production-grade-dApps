import 'dotenv/config'
import { createPublicClient, formatEther, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量: ${name}`)
  }
  return value
}

function printFriendlyError(err, rpcUrl) {
  const message = String(err?.message ?? err)
  if (message.includes('ECONNREFUSED') || message.includes('HTTP request failed')) {
    console.error('无法连接到 RPC 节点，请先启动本地区块链或修改 RPC_URL。')
    console.error('当前 RPC_URL =', rpcUrl)
    return
  }
  console.error(err)
}

async function main() {
  const rpcUrl = getRequiredEnv('RPC_URL')
  const privateKey = getRequiredEnv('PRIVATE_KEY')

  const account = privateKeyToAccount(
    privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  )

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(rpcUrl),
  })

  const chainId = await publicClient.getChainId()
  const blockNumber = await publicClient.getBlockNumber()
  const balance = await publicClient.getBalance({ address: account.address })
  const nonce = await publicClient.getTransactionCount({ address: account.address })

  console.log('当前账户:', account.address)
  console.log('chainId =', chainId)
  console.log('latestBlock =', blockNumber.toString())
  console.log('balance =', formatEther(balance), 'ETH')
  console.log('nonce =', nonce)
}

main().catch((err) => {
  const rpcUrl = process.env.RPC_URL ?? '<未配置>'
  printFriendlyError(err, rpcUrl)
  process.exit(1)
})
