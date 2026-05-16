import "dotenv/config";
import { createWsClient } from "polkadot-api/ws";
import { createPublicClient, http, isAddress, keccak256, pad, toHex } from "viem";
import { defineChain } from "viem";
import { ethers } from "ethers";
import { decodeAddress, encodeAddress, cryptoWaitReady } from "@polkadot/util-crypto";
import { hexToU8a, u8aToHex } from "@polkadot/util";

const SS58_PREFIX = Number(process.env.SS58_PREFIX ?? 42);
const SUBSTRATE_WSS =
  process.env.SUBSTRATE_WSS ?? "wss://westend-asset-hub-rpc.polkadot.io";
const EVM_RPC =
  process.env.EVM_RPC ?? "https://westend-asset-hub-eth-rpc.polkadot.io";
const TEST_EVM_ADDRESS = process.env.TEST_EVM_ADDRESS;
const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY;

if (!TEST_EVM_ADDRESS || !isAddress(TEST_EVM_ADDRESS)) {
  throw new Error(
    "请在 .env 中提供合法 TEST_EVM_ADDRESS（例如 0x...）",
  );
}

const westendAssetHubEvm = defineChain({
  id: 420420421,
  name: "Westend Asset Hub (EVM)",
  nativeCurrency: {
    name: "WND",
    symbol: "WND",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [EVM_RPC],
    },
  },
});

function evmToSs58(evmAddress, ss58Prefix = 42) {
  return encodeAddress(hexToU8a(evmAddress), ss58Prefix);
}

function ss58ToEvm(ss58Address) {
  const raw = decodeAddress(ss58Address);
  const hex = u8aToHex(raw);
  if (hex.length !== 42) {
    throw new Error(`不是 20-byte 账户，无法转为 EVM 地址: ${ss58Address}`);
  }
  return ethers.getAddress(hex);
}

function buildEcRecoverInput(digestHex, signature) {
  const v = pad(toHex(signature.v), { size: 32 });
  const r = pad(signature.r, { size: 32 });
  const s = pad(signature.s, { size: 32 });
  return `${digestHex}${v.slice(2)}${r.slice(2)}${s.slice(2)}`;
}

async function main() {
  await cryptoWaitReady();

  console.log("=== 1) 使用 PAPI 连接 Polkadot Testnet (Westend Asset Hub) ===");
  const papiClient = createWsClient(SUBSTRATE_WSS);
  console.log(`PAPI WS 已连接: ${SUBSTRATE_WSS}`);
  console.log(`当前连接状态: ${JSON.stringify(papiClient.getStatus())}`);

  console.log("\n=== 2) 地址转换：EVM <-> SS58 ===");
  const ss58Address = evmToSs58(TEST_EVM_ADDRESS, SS58_PREFIX);
  const evmRoundTrip = ss58ToEvm(ss58Address);

  console.log(`EVM 地址:      ${ethers.getAddress(TEST_EVM_ADDRESS)}`);
  console.log(`SS58 地址:     ${ss58Address}`);
  console.log(`反向转换 EVM:   ${evmRoundTrip}`);
  console.log(
    `地址转换一致性: ${evmRoundTrip.toLowerCase() === TEST_EVM_ADDRESS.toLowerCase()}`,
  );

  console.log("\n=== 3) ethers 与 viem 查询余额并比较 ===");
  const viemClient = createPublicClient({
    chain: westendAssetHubEvm,
    transport: http(EVM_RPC),
  });
  const ethersProvider = new ethers.JsonRpcProvider(EVM_RPC);

  const [viemBalance, ethersBalance] = await Promise.all([
    viemClient.getBalance({ address: ethers.getAddress(TEST_EVM_ADDRESS) }),
    ethersProvider.getBalance(ethers.getAddress(TEST_EVM_ADDRESS)),
  ]);

  console.log(`viem balance:   ${viemBalance} wei`);
  console.log(`ethers balance: ${ethersBalance} wei`);
  console.log(`余额一致性:     ${viemBalance === ethersBalance}`);

  console.log("\n=== 4) 调用 precompile: ecrecover (0x000...0001) ===");
  if (!TEST_PRIVATE_KEY) {
    console.log("未提供 TEST_PRIVATE_KEY，跳过 precompile 调用。\n");
  } else {
    const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);
    const digest = keccak256(toHex("papi-ethers-viem-precompile-test"));
    const sig = wallet.signingKey.sign(digest);

    const input = buildEcRecoverInput(digest, {
      v: sig.v,
      r: sig.r,
      s: sig.s,
    });

    const output = await viemClient.call({
      to: "0x0000000000000000000000000000000000000001",
      data: input,
    });

    const recovered = ethers.getAddress(`0x${output.data.slice(-40)}`);
    console.log(`签名者地址:        ${wallet.address}`);
    console.log(`precompile 恢复地址: ${recovered}`);
    console.log(`precompile 校验:     ${wallet.address === recovered}`);
  }

  papiClient.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
