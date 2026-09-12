// Shared Solidity compile helper using solc-js (standard JSON I/O). No Foundry/Hardhat
// dependency for the Gate 1 spike; contracts/ tooling for Gate 3 is decided separately
// (see DECISIONS.md D3).
import solc from "solc";
import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, dirname } from "node:path";

export function compileSolidityFile(filePath) {
  const source = readFileSync(filePath, "utf8");
  const fileName = basename(filePath);
  const expectedContractName = basename(filePath, extname(filePath));

  const input = {
    language: "Solidity",
    sources: Object.fromEntries(readdirSync(dirname(filePath)).filter(n => n.endsWith('.sol')).map(n =>
      [n, { content: readFileSync(`${dirname(filePath)}/${n}`, 'utf8') }])),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // AttestedCashflowRegistry's instantiateClaim has enough locals (decoded event
      // fields, proof structs) to hit "stack too deep" under the legacy codegen; viaIR
      // handles it. Applied to every compile for consistency, not just that one file.
      viaIR: true,
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    for (const e of errors) console.error(e.formattedMessage);
    throw new Error(`solc compile failed for ${fileName}`);
  }

  const contracts = output.contracts[fileName];
  const contractNames = Object.keys(contracts);

  // A file can declare helper interfaces/libraries alongside the deployable contract
  // (e.g. Gate1DecodeProbe.sol also declares INativeQueryVerifier, IEvmV1Decoder).
  // Prefer the contract whose name matches the file name; only require uniqueness if
  // that convention isn't followed.
  let name;
  if (contractNames.includes(expectedContractName)) {
    name = expectedContractName;
  } else if (contractNames.length === 1) {
    name = contractNames[0];
  } else {
    throw new Error(
      `${fileName}: multiple contracts (${contractNames.join(", ")}) and none match the file name ${expectedContractName}; rename the deployable contract to match the file, or pass an explicit name`
    );
  }
  const compiled = contracts[name];

  return {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
  };
}
