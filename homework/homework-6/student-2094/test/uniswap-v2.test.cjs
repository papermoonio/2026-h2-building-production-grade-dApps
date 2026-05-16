const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Uniswap V2 deploy and swap", function () {
  async function deployFixture() {
    const [owner, trader] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    await tokenA.waitForDeployment();

    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);
    await tokenB.waitForDeployment();

    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = await Factory.deploy(owner.address);
    await factory.waitForDeployment();

    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = await WETH9.deploy();
    await weth.waitForDeployment();

    const Router = await ethers.getContractFactory("UniswapV2Router02");
    const router = await Router.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();

    return { owner, trader, tokenA, tokenB, factory, weth, router };
  }

  it("deploys factory/router/weth successfully", async function () {
    const { factory, weth, router } = await deployFixture();

    expect(await factory.feeToSetter()).to.properAddress;
    expect(await weth.getAddress()).to.properAddress;
    expect(await router.factory()).to.equal(await factory.getAddress());
    expect(await router.WETH()).to.equal(await weth.getAddress());
  });

  it("adds liquidity and performs token swap", async function () {
    const { owner, trader, tokenA, tokenB, factory } = await deployFixture();
    const amountA = ethers.parseEther("1000");
    const amountB = ethers.parseEther("1000");

    await tokenA.mint(owner.address, amountA);
    await tokenB.mint(owner.address, amountB);
    await tokenA.mint(trader.address, ethers.parseEther("10"));

    await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pairAddress = await factory.getPair(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
    );
    expect(pairAddress).to.properAddress;

    const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);

    await tokenA.transfer(pairAddress, amountA);
    await tokenB.transfer(pairAddress, amountB);
    await pair.mint(owner.address);

    const traderAmountIn = ethers.parseEther("1");
    await tokenA.connect(trader).transfer(pairAddress, traderAmountIn);

    const token0 = await pair.token0();
    const [reserve0, reserve1] = await pair.getReserves();
    const isTokenA0 = token0.toLowerCase() === (await tokenA.getAddress()).toLowerCase();

    const reserveIn = isTokenA0 ? reserve0 : reserve1;
    const reserveOut = isTokenA0 ? reserve1 : reserve0;
    const amountInWithFee = traderAmountIn * 997n;
    const amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);

    const beforeBalanceOut = await tokenB.balanceOf(trader.address);

    await pair.swap(
      isTokenA0 ? 0n : amountOut,
      isTokenA0 ? amountOut : 0n,
      trader.address,
      "0x",
    );

    const afterBalanceOut = await tokenB.balanceOf(trader.address);
    expect(afterBalanceOut).to.be.greaterThan(beforeBalanceOut);
  });
});
