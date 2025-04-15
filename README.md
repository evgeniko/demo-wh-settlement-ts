# Demo Liquidity Layer

This project demonstrates how to interact with Wormhole's liquidity layer to place fast market orders across different chains.

## Prerequisites

- Node.js (v14 or higher)
- npm
- A wallet with USDC on Arbitrum Sepolia testnet
- Private key in `.env` file (see Configuration section)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Configuration

1. Create a `.env` file in the root directory with your private key:
```bash
PRIVATE_KEY=your_private_key_here
```

2. The configuration for different chains and contracts can be found in `src/fastMarketOrder.ts`. Currently configured for:
- Arbitrum Sepolia (Chain ID: 10003)
- Optimism Sepolia (Chain ID: 10005)

## Usage

To place a fast market order from Arbitrum Sepolia to Optimism Sepolia:

```bash
npm start
```

This will:
1. Check and approve USDC allowance if needed
2. Place a fast market order with the following parameters:
   - Amount: 101 USDC (minimum amount required)
   - Max Fee: 0.1 USDC
   - Deadline: 1 hour from transaction time

## Important Notes

- The minimum transfer amount is 100 USDC (as defined in the contract)
- Make sure you have sufficient USDC balance on Arbitrum Sepolia
- The example uses testnet configurations and USDC addresses
- Current USDC address on Arbitrum Sepolia: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`
- Current Token Router address on Arbitrum Sepolia: `0xe0418C44F06B0b0D7D1706E01706316DBB0B210E`

## Troubleshooting

If you encounter errors:
1. Check your USDC balance
2. Verify the private key in `.env`
3. Ensure you're using the correct chain IDs and contract addresses
4. Check if the minimum amount requirement is met (100 USDC)

## References

- [Wormhole Dashboard Constants](https://github.com/wormhole-foundation/wormhole-dashboard/blob/main/watcher/src/fastTransfer/consts.ts)
- [Circle USDC Testnet Addresses](https://developers.circle.com/stablecoins/usdc-on-test-networks) 