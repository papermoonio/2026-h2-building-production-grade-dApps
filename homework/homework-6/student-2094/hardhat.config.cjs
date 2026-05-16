require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const EVM_RPC = process.env.EVM_RPC ?? "https://westend-asset-hub-eth-rpc.polkadot.io";
const TESTNET_PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY ?? "";

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    westendAssetHub: {
      url: EVM_RPC,
      chainId: 420420421,
      accounts: TESTNET_PRIVATE_KEY ? [TESTNET_PRIVATE_KEY] : [],
    },
  },
};
