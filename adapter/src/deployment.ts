import { parseAbi, type PublicClient } from "viem";
export interface DeploymentManifest {
  contracts: {
    AttestedCashflowRegistry: { address: string };
    CashflowLendingVenue: { address: string };
    MockUSDC: { address: string };
  };
}
export async function checkDeployment(client: PublicClient, manifest: DeploymentManifest): Promise<void> {
  const registry = manifest.contracts.AttestedCashflowRegistry.address as `0x${string}`;
  const venue = manifest.contracts.CashflowLendingVenue.address as `0x${string}`;
  const token = manifest.contracts.MockUSDC.address as `0x${string}`;
  const abi = parseAbi(["function venue() view returns(address)", "function registry() view returns(address)",
    "function ccUSD() view returns(address)", "function depositAssetDecimals() view returns(uint8)", "function ccUSDDecimals() view returns(uint8)"]);
  const [actualVenue, actualRegistry, actualToken, depositDecimals, settlementDecimals] = await Promise.all([
    client.readContract({address:registry,abi,functionName:"venue"}),
    client.readContract({address:venue,abi,functionName:"registry"}),
    client.readContract({address:venue,abi,functionName:"ccUSD"}),
    client.readContract({address:venue,abi,functionName:"depositAssetDecimals"}),
    client.readContract({address:venue,abi,functionName:"ccUSDDecimals"}),
  ]);
  if(actualVenue.toLowerCase()!==venue.toLowerCase() || actualRegistry.toLowerCase()!==registry.toLowerCase() ||
    actualToken.toLowerCase()!==token.toLowerCase() || depositDecimals!==18 || settlementDecimals!==6)
    throw new Error("DEPLOYMENT_DRIFT: registry, venue, token or decimal policy does not match manifest");
}
