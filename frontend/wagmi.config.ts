import { createConfig, http, cookieStorage, createStorage } from "wagmi";
import { lineaSepolia, linea, mainnet } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
  blockExplorers: {
    default: {
      name: "Localhost",
      url: "http://127.0.0.1:8545",
    },
  },
  testnet: true,
});

export function getConfig() {
  return createConfig({
    chains: [hardhatLocal, lineaSepolia, linea, mainnet],
    connectors: [metaMask()],
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: {
      [hardhatLocal.id]: http("http://127.0.0.1:8545"),
      [lineaSepolia.id]: http(),
      [linea.id]: http(),
      [mainnet.id]: http(),
    },
  });
}
