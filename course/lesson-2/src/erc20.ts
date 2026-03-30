import { ethers, getAddress } from "ethers";
import { readFileSync } from "fs";
import { TypedApi } from "polkadot-api";
import { devnet, hub } from "@polkadot-api/descriptors";
import { getPolkadotSigner } from "polkadot-api/signer";
import { accountId32ToH160, convertPublicKeyToSs58, getAlice, getBob } from "./accounts";
import { getApi, getProvider } from "./utils";

const asset = getAddress("0x02faf2C500000000000000000000000001200000")

const abi = [
    {
        "constant": true,
        "inputs": [],
        "name": "name",
        "outputs": [
            {
                "name": "",
                "type": "string"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_spender",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "name": "",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_from",
                "type": "address"
            },
            {
                "name": "_to",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "transferFrom",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [
            {
                "name": "",
                "type": "uint8"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "name": "balance",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [
            {
                "name": "",
                "type": "string"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_to",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            },
            {
                "name": "_spender",
                "type": "address"
            }
        ],
        "name": "allowance",
        "outputs": [
            {
                "name": "",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "payable": true,
        "stateMutability": "payable",
        "type": "fallback"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "name": "spender",
                "type": "address"
            },
            {
                "indexed": false,
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Approval",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    }
];

export async function getERC20Balance(provider: ethers.JsonRpcProvider, address: string) {

    const contract = new ethers.Contract(asset, abi, provider);
    if (!contract || !contract.totalSupply || !contract.balanceOf) {
        throw new Error("Contract is not defined");
    }

    console.log("contract: ", await contract.getAddress());
    const balance = await contract.totalSupply();
    console.log("Balance: ", balance);
    const balanceOf = await contract.balanceOf(address);
    console.log("Balance of: ", balanceOf);
}


export async function createERC20Asset(api: TypedApi<typeof devnet | typeof hub>) {
    const alice = getAlice();
    const ss58Address = convertPublicKeyToSs58(alice.publicKey);
    console.log("ss58Address: ", ss58Address);
    const aliceSigner = getPolkadotSigner(
        alice.publicKey,
        "Sr25519",
        alice.sign,
    )

    const nextId = await api.query.Assets.NextAssetId.getValue();
    if (!nextId) {
        throw new Error("NextAssetId is not defined");
    }
    console.log("nextId: ", nextId.toString(16));

    const tx = api.tx.Assets.create({
        id: nextId,
        admin: { type: "Id", value: ss58Address },
        min_balance: BigInt(100),
    })

    const hash = await tx.signAndSubmit(aliceSigner);
    console.log("hash: ", hash.dispatchError?.value);

    const metadata = await api.query.Assets.Asset.getValue(nextId);
    console.log("metadata: ", metadata);

    const bob = getBob();
    const bobSs58 = convertPublicKeyToSs58(bob.publicKey);
    console.log("bobSs58: ", bobSs58);

    const mintTx = api.tx.Assets.mint({
        id: nextId,
        beneficiary: { type: "Id", value: bobSs58 },
        amount: BigInt(100000),

    })
    const hash2 = await mintTx.signAndSubmit(aliceSigner);
    console.log("hash: ", hash2);

    const balance = await api.query.Assets.Account.getValue(nextId, bobSs58);
    console.log("Balance: ", balance);

    const nextId2 = await api.query.Assets.NextAssetId.getValue();
    if (!nextId2) {
        throw new Error("NextAssetId is not defined");
    }
    console.log("nextId: ", nextId2.toString(16));
}

async function main() {
    const api = getApi(false);
    const provider = getProvider(false);
    // await createERC20Asset(api);
    const bob = getBob();
    const address = accountId32ToH160(bob.publicKey);
    console.log("address: ", address);
    await getERC20Balance(provider, address);
}

main();