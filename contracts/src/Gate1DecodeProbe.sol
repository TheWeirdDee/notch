// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Gate 1 decode-seam spike per Notch-PRD.md section 20 and Appendix D. Verifies a
// Sablier stream-creation transaction via the BlockProver precompile
// (0x0000000000000000000000000000000000000FD2), then decodes depositAmount and
// unlockAmounts from the verified transaction's CreateLockupLinearStream event log --
// never from user input. Throwaway probe; the production path is
// AttestedCashflowRegistry (Gate 3), which additionally enforces the full shape checks
// in PRD section 7.2.
//
// Interfaces transcribed from gluwa/creditcoin3 (precompiles/metadata/abi/block_prover.json)
// and gluwa/USC-Builder-Examples (contracts/UseCases/SourceDestinationLoanRecording/EvmV1Decoder.sol),
// which is deployed on CC3 Testnet at the pinned Decoder address (PRD Appendix D).
//
// PRD v2 is explicit that these method names and the verify entrypoint are NOT
// confirmed from docs alone -- this probe IS the live-ABI confirmation step (Gate 1).
// Do not copy this interface into the Gate 3 production registry until a real
// verifyAndDecode call against a real proof has succeeded end to end; see DECISIONS.md
// D5 item 5 and D7. Decodes the EVENT depositAmount only (never totalAmount, never
// calldata) and requires receiptStatus == 1 before returning any decoded field --
// matches PRD v2 invariants 1-2 and section 7.1.

interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);
}

interface IEvmV1Decoder {
    struct LogEntry {
        address address_;
        bytes32[] topics;
        bytes data;
    }

    struct ReceiptFields {
        uint8 receiptStatus;
        uint64 receiptGasUsed;
        LogEntry[] receiptLogs;
        bytes receiptLogsBloom;
    }

    function getTransactionType(bytes memory encodedTx) external pure returns (uint8);
    function isValidTransactionType(uint8 txType) external pure returns (bool);
    function decodeReceiptFields(bytes memory chunk) external pure returns (ReceiptFields memory);
}

contract Gate1DecodeProbe {
    address constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;

    // keccak256("CreateLockupLinearStream(uint256,(address,address,address,uint128,address,bool,bool,(uint40,uint40),string),uint40,uint40,(uint128,uint128))")
    // Computed with viem's toEventSelector against the ABI transcribed from
    // sablier-labs/evm-monorepo (lockup/src/interfaces/ISablierLockupLinear.sol +
    // lockup/src/types/{Lockup.sol,LockupLinear.sol}), not typed by hand.
    bytes32 public constant CREATE_LOCKUP_LINEAR_STREAM_TOPIC0 =
        0xbc42cec3f2bd75ce97894dacc83ec6c4b682220d349b5a52d5743e7b46eba2d0;

    IEvmV1Decoder public immutable decoder;
    address public immutable expectedSourceContract;

    struct Timestamps {
        uint40 start;
        uint40 end;
    }

    struct CreateEventCommon {
        address funder;
        address sender;
        address recipient;
        uint128 depositAmount;
        address token;
        bool cancelable;
        bool transferable;
        Timestamps timestamps;
        string shape;
    }

    struct UnlockAmounts {
        uint128 start;
        uint128 cliff;
    }

    struct Decoded {
        bool verified;
        bool found;
        uint256 streamId;
        address recipient;
        address token;
        uint128 depositAmount;
        bool cancelable;
        uint128 unlockAmountsStart;
        uint128 unlockAmountsCliff;
        uint40 cliffTime;
        uint40 endTime;
    }

    event Decoded1(
        uint256 indexed streamId,
        address recipient,
        address token,
        uint128 depositAmount,
        bool cancelable,
        uint128 unlockAmountsStart,
        uint128 unlockAmountsCliff,
        uint40 cliffTime,
        uint40 endTime
    );

    constructor(address decoderAddress, address sourceContract) {
        decoder = IEvmV1Decoder(decoderAddress);
        expectedSourceContract = sourceContract;
    }

    function verifyAndDecode(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (Decoded memory result) {
        INativeQueryVerifier.MerkleProof memory merkleProof = INativeQueryVerifier.MerkleProof({
            root: merkleRoot,
            siblings: siblings
        });
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: lowerEndpointDigest,
            roots: continuityRoots
        });

        // [FAIL CLOSED] reverts if inclusion + continuity proof do not verify.
        bool verified = INativeQueryVerifier(PRECOMPILE).verifyAndEmit(
            chainKey, height, encodedTransaction, merkleProof, continuityProof
        );
        require(verified, "verification failed");
        result.verified = true;

        uint8 txType = decoder.getTransactionType(encodedTransaction);
        require(decoder.isValidTransactionType(txType), "unsupported tx type");

        IEvmV1Decoder.ReceiptFields memory receipt = decoder.decodeReceiptFields(encodedTransaction);
        // Known boundary (PRD Appendix D): the precompile proves inclusion, not
        // success. This status check is the explicit success check the PRD calls for.
        require(receipt.receiptStatus == 1, "source tx did not succeed");

        // Filter logs in-contract rather than via decoder.getLogsByEventSignature --
        // that call is unreliable against the deployed CC3 testnet Decoder instance.
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            IEvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.address_ != expectedSourceContract) continue;
            if (log.topics.length != 2) continue;
            if (log.topics[0] != CREATE_LOCKUP_LINEAR_STREAM_TOPIC0) continue;

            (CreateEventCommon memory commonParams, uint40 cliffTime, , UnlockAmounts memory unlockAmounts) =
                abi.decode(log.data, (CreateEventCommon, uint40, uint40, UnlockAmounts));

            result.found = true;
            result.streamId = uint256(log.topics[1]);
            result.recipient = commonParams.recipient;
            result.token = commonParams.token;
            result.depositAmount = commonParams.depositAmount;
            result.cancelable = commonParams.cancelable;
            result.unlockAmountsStart = unlockAmounts.start;
            result.unlockAmountsCliff = unlockAmounts.cliff;
            result.cliffTime = cliffTime;
            result.endTime = commonParams.timestamps.end;
            break;
        }
        require(result.found, "CreateLockupLinearStream event not found");

        emit Decoded1(
            result.streamId,
            result.recipient,
            result.token,
            result.depositAmount,
            result.cancelable,
            result.unlockAmountsStart,
            result.unlockAmountsCliff,
            result.cliffTime,
            result.endTime
        );
    }
}
