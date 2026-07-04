/**
 * Deploys BlindDropRegistry to whatever network Hardhat is pointed at (Sepolia by default here).
 *
 * Required environment variables (read from contracts/.env via `dotenv`, see .env.example):
 *   RPC_URL     — Sepolia JSON-RPC endpoint
 *   PRIVATE_KEY — deployer private key (0x-prefixed); use a throwaway/deploy-only key
 *
 * Usage:
 *   cd contracts
 *   cp .env.example .env   # then fill in RPC_URL / PRIVATE_KEY
 *   npx hardhat run scripts/deploy.ts --network sepolia
 */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying BlindDropRegistry with account:", deployer.address);

  const Registry = await ethers.getContractFactory("BlindDropRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("BlindDropRegistry deployed to:", address);
  console.log(
    "Verify with: npx hardhat verify --network sepolia",
    address
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
