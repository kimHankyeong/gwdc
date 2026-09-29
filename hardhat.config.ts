// 배포 바이트코드 재현을 위해 기존 컴파일러·최적화 설정을 유지합니다.
import { defineConfig } from "hardhat/config";

export default defineConfig({
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "london",
      optimizer: { enabled: true, runs: 300 },
    },
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
});
