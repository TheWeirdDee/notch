import { config } from 'dotenv';
import { createPublicClient,createWalletClient,http,keccak256,stringToBytes,BaseError,ContractFunctionRevertedError } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { cc3Testnet } from '../web/src/lib/chains.ts';
import { registryAbi,venueAbi } from '../web/src/lib/abi.ts';
import { REGISTRY_ADDRESS,VENUE_ADDRESS } from '../web/src/lib/constants.ts';
import { DEMO } from '../web/src/lib/demo.ts';
config({path:'web/.env.local',quiet:true});
const account=privateKeyToAccount(process.env.SECOND_LENDER_PRIVATE_KEY as `0x${string}`);
const c=createPublicClient({chain:cc3Testnet,transport:http(undefined,{timeout:15000})});
const file='data/gate8/dashboard-mined-refusal.json';
const actionKey=keccak256(stringToBytes('notch-gate8-dashboard-refusal-stream186-50000-v1'));
const amount=50000n*10n**18n;
const p=await c.readContract({address:REGISTRY_ADDRESS,abi:registryAbi,functionName:'claims',args:[DEMO.claimId]});
const available=await c.readContract({address:REGISTRY_ADDRESS,abi:registryAbi,functionName:'available',args:[DEMO.claimId]});
const originalLoan=await c.getTransaction({hash:DEMO.financeTx});
if(account.address.toLowerCase()===originalLoan.from.toLowerCase())throw Error('Second lender is not distinct');
if(available>=amount)throw Error('Refuse to send: amount is within capacity');
const args=[actionKey,DEMO.claimId,amount] as const;
try {await c.simulateContract({account,address:VENUE_ADDRESS,abi:[...venueAbi,...registryAbi],functionName:'finance',args});throw Error('Expected exact capacity refusal');}
catch(e){const r=e instanceof BaseError?e.walk(x=>x instanceof ContractFunctionRevertedError):null;if(!(r instanceof ContractFunctionRevertedError)||r.data?.errorName!=='InsufficientFinancingCapacity')throw e;}
let hash: `0x${string}`;
if(existsSync(file)){hash=JSON.parse(readFileSync(file,'utf8')).txHash;}
else {
 const wallet=createWalletClient({account,chain:cc3Testnet,transport:http(undefined,{timeout:15000})});
 hash=await wallet.writeContract({address:VENUE_ADDRESS,abi:venueAbi,functionName:'finance',args,gas:200000n});
 writeFileSync(file,JSON.stringify({txHash:hash,claimId:DEMO.claimId,status:'pending',actionKey},null,2));
}
const r=await c.waitForTransactionReceipt({hash});
const after=await c.readContract({address:REGISTRY_ADDRESS,abi:registryAbi,functionName:'available',args:[DEMO.claimId]});
if(r.status!=='reverted'||after!==available)throw Error('Refusal invariant failed');
const evidence={txHash:hash,claimId:DEMO.claimId,actionKey,lender:account.address,originalLender:originalLoan.from,requestedRaw:amount.toString(),availableRaw:available.toString(),afterRaw:after.toString(),status:r.status,block:r.blockNumber.toString(),reason:'InsufficientFinancingCapacity',recordedAt:new Date().toISOString()};
writeFileSync(file,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
