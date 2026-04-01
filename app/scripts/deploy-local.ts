import { writeFile } from "node:fs/promises";
import { formatEther, parseEther } from "viem";
import { network } from "hardhat";

const { viem } = await network.connect({ network: "localhost" });

const [deployer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

console.log("Deploying from:", deployer.account.address);

const cityToken = await viem.deployContract("GameTokenLocal", [deployer.account.address]);
const city = await viem.deployContract("CityFiledLocal", [cityToken.address]);
const heroCurrency = await viem.deployContract("InGameCurrencyLocal", [deployer.account.address]);
const hero = await viem.deployContract("HeroNFT", [deployer.account.address]);
const pack = await viem.deployContract("PackOpenerLocal", [heroCurrency.address, hero.address, parseEther("25")]);
const heroMarketplace = await viem.deployContract("HeroMarketplace", [deployer.account.address, hero.address, heroCurrency.address]);

await deployer.writeContract({
  address: cityToken.address,
  abi: cityToken.abi,
  functionName: "setGame",
  args: [city.address],
});

await deployer.writeContract({
  address: cityToken.address,
  abi: cityToken.abi,
  functionName: "mint",
  args: [cityToken.address, parseEther("1000000")],
});

await deployer.writeContract({
  address: city.address,
  abi: city.abi,
  functionName: "setLevelUpPrice",
  args: [0, parseEther("0.01")],
});

await deployer.writeContract({
  address: city.address,
  abi: city.abi,
  functionName: "setLevelUpPrice",
  args: [1, parseEther("0.02")],
});

await deployer.writeContract({
  address: city.address,
  abi: city.abi,
  functionName: "setLevelUpPrice",
  args: [2, parseEther("0.03")],
});

await deployer.writeContract({
  address: heroCurrency.address,
  abi: heroCurrency.abi,
  functionName: "setSpender",
  args: [pack.address, true],
});

await deployer.writeContract({
  address: heroCurrency.address,
  abi: heroCurrency.abi,
  functionName: "setSpender",
  args: [heroMarketplace.address, true],
});

await deployer.writeContract({
  address: hero.address,
  abi: hero.abi,
  functionName: "setMinter",
  args: [pack.address, true],
});

const blockNumber = await publicClient.getBlockNumber();
const frontendEnv = [
  `NEXT_PUBLIC_CITY_ADDRESS=${city.address}`,
  `NEXT_PUBLIC_TOKEN_ADDRESS=${cityToken.address}`,
  `NEXT_PUBLIC_HERO_CURRENCY_ADDRESS=${heroCurrency.address}`,
  `NEXT_PUBLIC_HERO_NFT_ADDRESS=${hero.address}`,
  `NEXT_PUBLIC_PACK_OPENER_ADDRESS=${pack.address}`,
  `NEXT_PUBLIC_HERO_MARKETPLACE_ADDRESS=${heroMarketplace.address}`,
].join("\n");

const rootEnv = [
  "FRONTEND_HOST=crypto-game-frontend",
  frontendEnv,
].join("\n");

await writeFile("/app/deploy-frontend.env", `${frontendEnv}\n`);
await writeFile("/app/deploy-root.env", `${rootEnv}\n`);

console.log("Deployment block:", blockNumber.toString());
console.log("");
console.log("Frontend env:");
console.log(frontendEnv);
console.log("");
console.log("Pack price:", formatEther(parseEther("25")), "hero currency");
console.log("Saved: /app/deploy-frontend.env and /app/deploy-root.env");
