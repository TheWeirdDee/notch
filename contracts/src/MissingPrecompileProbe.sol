// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Gate 3 parity: the "missing precompile" fixture (core/fixtures/missing-precompile.json)
// on real infrastructure. AttestedCashflowRegistry hardcodes the BlockProver precompile
// address as a constant (it's a fixed system precompile, always present on CC3
// Testnet), so there is no way to make it "vanish" on the real deployment -- the only
// honest way to exercise this failure mode on-chain is a separate probe whose verifier
// address is configurable, pointed at a real deployed contract that does not speak the
// INativeQueryVerifier interface. Throwaway; not part of the production path.

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

contract MissingPrecompileProbe {
    address public immutable verifier;

    error VerificationFailed();

    constructor(address verifierAddress) {
        verifier = verifierAddress;
    }

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external returns (bool) {
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings});
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots});
        bool verified =
            INativeQueryVerifier(verifier).verifyAndEmit(chainKey, height, encodedTransaction, merkleProof, continuityProof);
        if (!verified) revert VerificationFailed();
        return true;
    }
}
