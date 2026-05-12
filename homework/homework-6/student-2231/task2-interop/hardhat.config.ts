import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

/**
 * Network configuration for EVM-PVM interop example.
 *
 * `polkadotTestnet` uses the same Polkadot Hub TestNet RPC that hosts
 * both REVM (EVM) and PolkaVM (PVM) execution backends. Both contracts
 * in this project can be deployed to this network; the only difference
 * is which compiler produced their bytecode:
 *   - EventRegistry: standard solc -> REVM
 *   - TicketMinter: resolc (revive) -> PolkaVM
 *
 * For local Hardhat testing both contracts are compiled by solc and run
 * on the default in-process EVM — this is fine because the Solidity
 * source itself is VM-agnostic.
 */

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    localNode: {
      url: "http://127.0.0.1:8545",
    },
    polkadotTestnet: {
      url: "https://services.polkadothub-rpc.com/testnet",
      accounts: vars.has("TESTNET_PRIVATE_KEY")
        ? [vars.get("TESTNET_PRIVATE_KEY")]
        : [],
    },
  },
  mocha: {
    timeout: 120000,
  },
};

export default config;
