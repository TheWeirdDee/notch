// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// CashflowLendingVenue -- Gate 3. One atomic product transaction: consume capacity,
// then move ccUSD lender to borrower. Order fixed so an over-request reverts before
// any transfer; a failed transfer reverts the consume automatically (EVM atomicity --
// a later revert in the same transaction unwinds every earlier state change in it,
// including registry.consume()'s financedCapacity write).
//
// Decimals note (found and fixed twice during Gate 3's real on-chain parity testing):
// the Sablier deposit asset and ccUSD are not guaranteed to share a decimal count --
// Notch-PRD.md Appendix C pins ccUSD at 6 decimals, but says nothing about the deposit
// asset's decimals, which are whatever the real Ethereum position used (the Gate 1
// NotchDemoAsset happens to be 18, matching common ERC-20 convention). `amount` is
// always in the deposit asset's native decimals -- the same scale as
// originalCapacity/available, so registry.consume() needs no conversion at all and
// matches Notch-PRD.md Appendix C literally. This contract converts to ccUSD's own
// decimals only at the point of transfer. Getting this wrong silently defeats
// conservation: passing a small ccUSD-scale number as `amount` against an 18-decimal
// capacity barely dents financedCapacity, so a genuine over-draw looks "available"
// indefinitely.
//
// A first fix tried to read the deposit asset's decimals on-chain via
// `IERC20(claim.asset).decimals()` -- wrong, because `claim.asset` is the token's
// address ON ETHEREUM SEPOLIA (decoded from the proven cross-chain event), not a
// contract that exists at that address on CC3 Testnet. Calling it here always reverts
// (no code at that address on this chain). Every claim this registry ever creates
// shares the same `approvedDemoAsset` (instantiateClaim enforces `token ==
// approvedDemoAsset`), so its decimals are fixed, known, deployment-time operator
// metadata -- not something to look up per claim, let alone cross-chain. Supplied once
// at construction instead. Recorded in DECISIONS.md.

interface IAttestedCashflowRegistry {
    function consume(bytes32 claimId, uint128 amount) external;
    function borrowerOf(bytes32 claimId) external view returns (address);
    function available(bytes32 claimId) external view returns (uint128);
}

interface IERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

contract CashflowLendingVenue {
    IAttestedCashflowRegistry public immutable registry;
    IERC20Like public immutable ccUSD;
    uint8 public immutable ccUSDDecimals;
    uint8 public immutable depositAssetDecimals;

    event LoanOriginated(
        bytes32 indexed claimId, address indexed lender, address indexed borrower, uint128 amount, uint128 availableAfter
    );

    error TransferFailed();
    error AmountNotRepresentable();
    error InvalidDecimals();
    error ActionAlreadyApplied();
    error InvalidActionKey();
    mapping(bytes32 => bytes32) public actionResults;

    /// @param depositAssetDecimalsValue Decimals of the registry's approvedDemoAsset,
    /// as deployed on Ethereum Sepolia -- operator-supplied (CC3 has no way to query a
    /// Sepolia contract directly), since it's the same known value for every claim.
    constructor(address registryAddress, address ccUSDAddress, uint8 depositAssetDecimalsValue) {
        registry = IAttestedCashflowRegistry(registryAddress);
        ccUSD = IERC20Like(ccUSDAddress);
        ccUSDDecimals = IERC20Like(ccUSDAddress).decimals();
        depositAssetDecimals = depositAssetDecimalsValue;
        if (depositAssetDecimalsValue > 38 || ccUSDDecimals > 38) revert InvalidDecimals();
    }

    /// @param amount In the claim's deposit-asset decimals -- the same scale as
    /// originalCapacity/available. msg.sender is the lender; any address may call, so
    /// conservation holds across independent lenders (Notch-PRD.md Appendix C).
    function finance(bytes32 actionKey, bytes32 claimId, uint128 amount) external {
        if (actionKey == bytes32(0)) revert InvalidActionKey();
        bytes32 key = keccak256(abi.encode(msg.sender, actionKey));
        if (actionResults[key] != bytes32(0)) revert ActionAlreadyApplied();
        actionResults[key] = keccak256(abi.encode(claimId, amount));
        registry.consume(claimId, amount); // reverts on inactive/insufficient   [FAIL CLOSED #1]
        address borrower = registry.borrowerOf(claimId);
        uint256 ccUSDAmount = _convert(amount, depositAssetDecimals, ccUSDDecimals);
        bool ok = ccUSD.transferFrom(msg.sender, borrower, ccUSDAmount); // lender -> borrower
        if (!ok) revert TransferFailed();
        emit LoanOriginated(claimId, msg.sender, borrower, amount, registry.available(claimId));
    }

    function _convert(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) return amount;
        if (fromDecimals > toDecimals) {
            uint256 scale = 10 ** (fromDecimals - toDecimals);
            if (amount == 0 || amount % scale != 0) revert AmountNotRepresentable();
            return amount / scale;
        }
        return amount * (10 ** (toDecimals - fromDecimals));
    }
}
