import asyncio
import os
import edge_tts

# Voiceover segments matching Section 28 of user prompt
SCENES = [
    {
        "id": "scene1_hook",
        "text": "A real cashflow can be proven on-chain and still be financed twice. If two lenders cannot see each other's loans, each can verify the same position and independently believe the full amount is still available. Notch turns that reusable proof into one shared financing limit."
    },
    {
        "id": "scene2_source",
        "text": "Start with the source. This is Sablier stream 189 on Ethereum Sepolia. The creation transaction succeeded and locked a real 100,000-token position. That 100,000 is not a number we typed into Notch."
    },
    {
        "id": "scene3_activation",
        "text": "Attestcoin proves that Ethereum transaction to Creditcoin. Notch verifies the proof, checks the transaction succeeded, decodes the locked position, and instantiates the claim on Creditcoin. Here is the actual activation transaction at block 5,475,774."
    },
    {
        "id": "scene4_capacity",
        "text": "The claim starts with 100,000 of financing capacity because that is what the verified source transaction proves. Capacity is derived from the proof, not supplied by the borrower."
    },
    {
        "id": "scene5_finance",
        "text": "Then Lender A finances 70,000. This is not a simulation: 70,000 ccUSD actually moves from lender 0x28ac to the borrower in this successful Creditcoin transaction."
    },
    {
        "id": "scene6_historical",
        "text": "And we can prove that transaction consumed the capacity. Reading the registry at the previous block returns 100,000 available. At the exact settlement block, it returns 30,000."
    },
    {
        "id": "scene7_refusal_request",
        "text": "Now a second independent lender, from a different wallet, asks for 50,000. Only 30,000 remains. This is where a per-lender replay guard fails — but Notch's shared capacity sees both lenders."
    },
    {
        "id": "scene8_refusal_revert",
        "text": "The transaction was mined in the next block and reverted on-chain. The raw selector is 0xa3388671 — the contract's InsufficientFinancingCapacity error. No ccUSD moves and the shared capacity stays at 30,000."
    },
    {
        "id": "scene9_recompute",
        "text": "You do not have to trust this interface. These are read-only calls against the Creditcoin registry itself: 100,000 original, 70,000 financed, 30,000 available."
    },
    {
        "id": "scene10_closing",
        "text": "One verified cashflow. One conserved financing limit. Real money moves when capacity exists, and the next lender is refused when it does not. Notch proves capacity conservation inside this registry — not repayment, and not lenders outside it."
    }
]

VOICE = "en-US-ChristopherNeural"  # Authoritative, calm, clear technical voice
RATE = "+6%"  # crisp 155 wpm pace

async def main():
    os.makedirs("video/public/audio", exist_ok=True)
    for scene in SCENES:
        out_path = f"video/public/audio/{scene['id']}.mp3"
        print(f"Generating {scene['id']}...")
        communicate = edge_tts.Communicate(scene["text"], VOICE, rate=RATE)
        await communicate.save(out_path)
        print(f"Saved {out_path}")

if __name__ == "__main__":
    asyncio.run(main())
