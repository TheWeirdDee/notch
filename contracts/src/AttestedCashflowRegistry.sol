// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "./CashflowLendingVenue.sol";

// AttestedCashflowRegistry -- Gate 3. Owns claims and capacity. Verifies proofs,
// decodes, instantiates, and mutates capacity (only via the venue). Must match
// core/reference_model.md one-to-one; the Gate 2 fixture pack is the test oracle.
//
// Interfaces reused verbatim from contracts/src/Gate1DecodeProbe.sol, which proved
// them correct against real Attestcoin infrastructure in Gate 1 (see DECISIONS.md D5
// item 5 and D8) -- not re-derived from a blog, and not re-guessed here.

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

contract AttestedCashflowRegistry {
    address constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;

    // keccak256("CreateLockupLinearStream(uint256,(address,address,address,uint128,address,bool,bool,(uint40,uint40),string),uint40,uint40,(uint128,uint128))")
    // Computed with viem's toEventSelector against the ABI transcribed from
    // sablier-labs/evm-monorepo -- see contracts/src/Gate1DecodeProbe.sol, confirmed
    // against a real verified transaction in Gate 1.
    bytes32 public constant CREATE_LOCKUP_LINEAR_STREAM_TOPIC0 =
        0xbc42cec3f2bd75ce97894dacc83ec6c4b682220d349b5a52d5743e7b46eba2d0;

    /// Pinned per Notch-PRD.md Appendix F.
    address public constant ALLOWLISTED_SABLIER_LOCKUP = 0xe61cb9153356419bdaD0A8767c059f92d221a3C4;
    /// Confirmed live against the ChainInfo precompile in Gate 1 (DECISIONS.md D6), not
    /// assumed from docs.
    uint32 public constant EXPECTED_CHAIN_KEY = 1;

    IEvmV1Decoder public immutable decoder;
    address public immutable approvedDemoAsset;
    address public immutable venue;

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

    /// Matches Notch-PRD.md section 8 / Appendix C exactly.
    struct Claim {
        bytes32 claimId;
        uint32 sourceChainKey;
        bytes32 sourceTxHash; // display/provenance only -- see claimId note below
        address sourceContract;
        uint256 streamId;
        address borrower;
        address asset;
        uint128 originalCapacity;
        uint128 financedCapacity;
        uint40 lockedUntil;
        bool active;
    }

    mapping(bytes32 => Claim) public claims;

    event ClaimInstantiated(
        bytes32 indexed claimId, address indexed borrower, uint128 originalCapacity, uint40 lockedUntil
    );

    error VerificationFailed();
    error UnsupportedTransactionType();
    error ReceiptNotSuccess();
    error EventNotFound();
    error SourceContractNotAllowlisted();
    error ChainKeyMismatch();
    error CancelableNotAllowed();
    error DepositNotPositive();
    error TokenNotApproved();
    error UnlockAmountsNotZero();
    error CliffNotFuture();
    error ClaimAlreadyActive();
    error ClaimNotActive();
    error AmountNotPositive();
    error InsufficientFinancingCapacity();
    error OnlyVenue();
    error VenueImmutable();
    error TransferableNotAllowed();
    error ClaimExpired();

    constructor(address decoderAddress, address approvedDemoAssetAddress, address ccUSDAddress, uint8 depositDecimals) {
        decoder = IEvmV1Decoder(decoderAddress);
        approvedDemoAsset = approvedDemoAssetAddress;
        // The registry deploys its only venue itself, in the same transaction as its
        // own construction. No owner-controlled bootstrap window or replacement can
        // redirect consumption to an arbitrary contract.
        venue = address(new CashflowLendingVenue(address(this), ccUSDAddress, depositDecimals));
    }

    /// The venue is permanently immutable by design (DECISIONS.md D22/D23): a prior
    /// version allowed the owner to repoint it post-deploy, which would have let an
    /// owner redirect capacity consumption to an arbitrary contract -- a real finding,
    /// fixed by removing the setter's ability to do anything at all, not by adding
    /// access control to it. This function exists only so that call site continues to
    /// resolve; it always reverts, unconditionally, for any input, forever.
    function setVenue(address) external pure {
        revert VenueImmutable();
    }

    modifier onlyVenue() {
        if (msg.sender != venue) revert OnlyVenue();
        _;
    }

    /// @param realSourceTxHash The real Ethereum transaction hash, supplied by the
    /// caller for display/provenance (matches the Claim.sourceTxHash field in
    /// Notch-PRD.md section 8). NOT used to derive claimId -- see note below.
    function instantiateClaim(
        uint32 chainKey,
        uint64 headerNumber,
        bytes calldata txBytes,
        bytes32 realSourceTxHash,
        uint256 requestedStreamId,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bytes32 claimId) {
        // 1. BlockProver verify -> require(verified)                    [FAIL CLOSED #2]
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings});
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots});
        bool verified =
            INativeQueryVerifier(PRECOMPILE).verifyAndEmit(chainKey, headerNumber, txBytes, merkleProof, continuityProof);
        if (!verified) revert VerificationFailed();

        // 2. decode receipt from verified tx -> require(receiptStatus == 1)   [FAIL CLOSED #3]
        uint8 txType = decoder.getTransactionType(txBytes);
        if (!decoder.isValidTransactionType(txType)) revert UnsupportedTransactionType();
        IEvmV1Decoder.ReceiptFields memory receipt = decoder.decodeReceiptFields(txBytes);
        if (receipt.receiptStatus != 1) revert ReceiptNotSuccess();

        // 3. decode the CreateLockupLinearStream event (the path proven in Gate 1).
        // Searched by topic0 only (not pre-filtered by emitting address) so step 4 below
        // is a real, separate check against whatever contract actually emitted it.
        bool found;
        address sourceContract;
        uint256 streamId;
        CreateEventCommon memory commonParams;
        uint40 cliffTime;
        UnlockAmounts memory unlockAmounts;
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            IEvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.topics.length != 2) continue;
            if (log.topics[0] != CREATE_LOCKUP_LINEAR_STREAM_TOPIC0) continue;
            if (uint256(log.topics[1]) != requestedStreamId) continue;
            (commonParams, cliffTime,, unlockAmounts) =
                abi.decode(log.data, (CreateEventCommon, uint40, uint40, UnlockAmounts));
            sourceContract = log.address_;
            streamId = uint256(log.topics[1]);
            found = true;
            break;
        }
        if (!found) revert EventNotFound();

        // 4. require(sourceContract == allowlisted SablierLockup)
        if (sourceContract != ALLOWLISTED_SABLIER_LOCKUP) revert SourceContractNotAllowlisted();
        // 5. require(chainKey == EXPECTED_CHAIN_KEY)
        if (chainKey != EXPECTED_CHAIN_KEY) revert ChainKeyMismatch();
        // 6. require(cancelable == false)
        if (commonParams.cancelable) revert CancelableNotAllowed();
        if (commonParams.transferable) revert TransferableNotAllowed();
        // 7. require(depositAmount > 0)
        if (commonParams.depositAmount == 0) revert DepositNotPositive();
        // 8. require(token == approvedDemoAsset)
        if (commonParams.token != approvedDemoAsset) revert TokenNotApproved();
        // 9. require(unlockAmounts.start == 0 && unlockAmounts.cliff == 0)
        if (unlockAmounts.start != 0 || unlockAmounts.cliff != 0) revert UnlockAmountsNotZero();
        // 10. require(cliffTime > block.timestamp)
        if (cliffTime <= block.timestamp) revert CliffNotFuture();

        // claimId uniqueness: keccak256(chainKey, attestedTxDigest, streamId), NOT
        // keccak256(chainKey, realSourceTxHash, streamId) as PRD section 8's schema
        // reads literally. realSourceTxHash is a caller-supplied value with no
        // cryptographic tie to txBytes -- trusting it for uniqueness would let a
        // caller replay the SAME verified txBytes under many different claimed
        // "sourceTxHash" values, minting unlimited claims (and therefore unlimited
        // capacity) from one real position. attestedTxDigest = keccak256(txBytes) is
        // cryptographically pinned by verifyAndEmit's own success above, so it cannot
        // be spoofed independently of the real verified transaction. realSourceTxHash
        // is still stored on the claim, for display/provenance only. Recorded in
        // DECISIONS.md.
        bytes32 attestedTxDigest = keccak256(txBytes);
        // 11. claimId = keccak256(chainKey, sourceTxHash, streamId); require(!active)
        claimId = keccak256(abi.encodePacked(chainKey, attestedTxDigest, streamId));
        if (claims[claimId].active) revert ClaimAlreadyActive();

        // 12. store claim; originalCapacity = depositAmount; financedCapacity = 0; active = true
        claims[claimId] = Claim({
            claimId: claimId,
            sourceChainKey: chainKey,
            sourceTxHash: realSourceTxHash,
            sourceContract: sourceContract,
            streamId: streamId,
            borrower: commonParams.recipient,
            asset: commonParams.token,
            originalCapacity: commonParams.depositAmount,
            financedCapacity: 0,
            lockedUntil: cliffTime,
            active: true
        });

        emit ClaimInstantiated(claimId, commonParams.recipient, commonParams.depositAmount, cliffTime);
    }

    function available(bytes32 claimId) public view returns (uint128) {
        Claim storage c = claims[claimId];
        return c.originalCapacity - c.financedCapacity;
    }

    function borrowerOf(bytes32 claimId) external view returns (address) {
        return claims[claimId].borrower;
    }

    function consume(bytes32 claimId, uint128 amount) external onlyVenue {
        Claim storage c = claims[claimId];
        if (!c.active) revert ClaimNotActive();
        if (amount == 0) revert AmountNotPositive();
        if (amount > available(claimId)) revert InsufficientFinancingCapacity();
        if (block.timestamp >= c.lockedUntil) revert ClaimExpired();
        c.financedCapacity += amount;
    }
}
