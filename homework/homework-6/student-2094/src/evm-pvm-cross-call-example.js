import "dotenv/config";
import { createWsClient } from "polkadot-api/ws";
import { createPublicClient, createWalletClient, defineChain, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encodeAddress, cryptoWaitReady } from "@polkadot/util-crypto";
import { hexToU8a } from "@polkadot/util";

const SUBSTRATE_WSS = process.env.SUBSTRATE_WSS ?? "wss://westend-asset-hub-rpc.polkadot.io";
const EVM_RPC = process.env.EVM_RPC ?? "https://westend-asset-hub-eth-rpc.polkadot.io";
const SS58_PREFIX = Number(process.env.SS58_PREFIX ?? 42);
const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY;

const EXAMPLE_EVM_CONTRACT = process.env.EXAMPLE_EVM_CONTRACT ?? "";
const PVM_DISPATCH_PRECOMPILE = process.env.PVM_DISPATCH_PRECOMPILE ?? "";
const PVM_CALLDATA = process.env.PVM_CALLDATA ?? "";

if (!TEST_PRIVATE_KEY || !/^0x[0-9a-fA-F]{64}$/.test(TEST_PRIVATE_KEY)) {
  throw new Error("请在 .env 配置合法 TEST_PRIVATE_KEY（32字节十六进制）");
}

const westendAssetHubEvm = defineChain({
  id: 420420421,
  name: "Westend Asset Hub (EVM)",
  nativeCurrency: { name: "WND", symbol: "WND", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
});

function evmToSs58(evmAddress, ss58Prefix = 42) {
  return encodeAddress(hexToU8a(evmAddress), ss58Prefix);
}

async function main() {
  await cryptoWaitReady();

  const wsClient = createWsClient(SUBSTRATE_WSS);
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: westendAssetHubEvm,
    transport: http(EVM_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: westendAssetHubEvm,
    transport: http(EVM_RPC),
  });

  const ss58Address = evmToSs58(account.address, SS58_PREFIX);

  console.log("=== 双向互调示例基础信息 ===");
  console.log(`EVM 地址:  ${account.address}`);
  console.log(`PVM 地址:  ${ss58Address}`);
  console.log(`PAPI 状态: ${JSON.stringify(wsClient.getStatus())}`);

  console.log("\n=== 1) PVM -> EVM 示例（同一映射账户读 EVM 合约） ===");
  if (EXAMPLE_EVM_CONTRACT && isAddress(EXAMPLE_EVM_CONTRACT)) {
    const value = await publicClient.readContract({
      address: EXAMPLE_EVM_CONTRACT,
      abi: [
        {
          inputs: [],
          name: "value",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "value",
    });

    console.log(`读取 EVM 合约 ${EXAMPLE_EVM_CONTRACT}.value() = ${value}`);
  } else {
    console.log("未配置 EXAMPLE_EVM_CONTRACT，跳过合约读取示例。");
  }

  console.log("\n=== 2) EVM -> PVM 示例（调用 PVM Dispatch Precompile） ===");
  if (isAddress(PVM_DISPATCH_PRECOMPILE) && /^0x[0-9a-fA-F]*$/.test(PVM_CALLDATA) && PVM_CALLDATA.length >= 2) {
    const txHash = await walletClient.sendTransaction({
      to: PVM_DISPATCH_PRECOMPILE,
      data: PVM_CALLDATA,
      value: 0n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`Precompile 调用交易: ${txHash}`);
    console.log(`状态: ${receipt.status}`);
  } else {
    console.log("未配置 PVM_DISPATCH_PRECOMPILE / PVM_CALLDATA，跳过 EVM -> PVM 交易发送。");
  }

  wsClient.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
