const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();
  if (!signers.length) {
    throw new Error("未检测到部署账户，请在 .env 设置 TESTNET_PRIVATE_KEY");
  }

  const [deployer] = signers;
  console.log(`Deployer: ${deployer.address}`);

  const Factory = await hre.ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();

  const WETH9 = await hre.ethers.getContractFactory("WETH9");
  const weth = await WETH9.deploy();
  await weth.waitForDeployment();

  const Router = await hre.ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(await factory.getAddress(), await weth.getAddress());
  await router.waitForDeployment();

  console.log(`UniswapV2Factory: ${await factory.getAddress()}`);
  console.log(`WETH9: ${await weth.getAddress()}`);
  console.log(`UniswapV2Router02: ${await router.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
