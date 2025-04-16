import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Constants
const GAS_LIMIT = 1000000;

// Chain configurations
const ARBITRUM_SEPOLIA = {
  chainId: 10003,
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  tokenRouterAddress: '0xe0418C44F06B0b0D7D1706E01706316DBB0B210E'
};

const OPTIMISM_SEPOLIA = {
  chainId: 10005,
  rpcUrl: 'https://sepolia.optimism.io',
  tokenRouterAddress: '0x6BAa7397c18abe6221b4f6C3Ac91C88a9faE00D8'
};

// Token Router ABI
const tokenRouterAbi = [
  "function placeFastMarketOrder(uint64 amountIn, uint16 targetChain, bytes32 redeemer, bytes redeemerMessage, uint64 maxFee, uint32 deadline) external payable returns (uint64 sequence, uint64 fastSequence, uint256 protocolSequence)",
  "function getFastTransferParameters() external view returns (tuple(bool enabled, uint64 maxAmount, uint64 baseFee, uint64 initAuctionFee))"
];

// USDC address for ArbitrumSepolia https://developers.circle.com/stablecoins/usdc-on-test-networks
const USDC_ARB_SEP_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

// USDC ABI
const usdcAbi = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

interface FastMarketOrderParams {
  amountIn: bigint;  // uint64
  targetChain: number;  // uint16
  redeemer: string;
  redeemerMessage: string;
  maxFee: bigint;  // uint64
  deadline: number;  // uint32
}

// Order parameters
// Note: Minimum transfer amounts:
// - Mainnet: 100 USDC
// - Testnet: 10 USDC
const ORDER_PARAMS = {
  amountIn: BigInt("10000000"),
  targetChain: OPTIMISM_SEPOLIA.chainId,
  redeemer: "0x08Ab1Ce3686cb7E616af2D3E068356B160c4c038",
  redeemerMessage: "Epoch Test",
  deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
};

(async () => {
  try {
    // Use Arbitrum Sepolia as the origin chain
    const config = ARBITRUM_SEPOLIA;
    
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY not found in environment variables');
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Create contract instances
    const tokenRouterContract = new ethers.Contract(
      config.tokenRouterAddress,
      tokenRouterAbi,
      wallet
    );

    const usdcContract = new ethers.Contract(
      USDC_ARB_SEP_ADDRESS,
      usdcAbi,
      wallet
    );

    // Get fast transfer parameters and calculate minimum required fee
    const fastParams = await tokenRouterContract.getFastTransferParameters();
    const minimumRequiredFee = fastParams.baseFee + fastParams.initAuctionFee + BigInt(1);

    // Define order parameters
    const params: FastMarketOrderParams = {
      ...ORDER_PARAMS,
      maxFee: minimumRequiredFee
    };

    // Validate parameters
    if (params.amountIn <= params.maxFee) {
      throw new Error(`Amount (${params.amountIn}) must be greater than max fee (${params.maxFee})`);
    }

    // Check USDC balance and allowance
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    console.log('USDC Balance:', ethers.formatUnits(usdcBalance, 6), 'USDC');

    if (usdcBalance < params.amountIn) {
      throw new Error(`Insufficient USDC balance. Required: ${ethers.formatUnits(params.amountIn, 6)} USDC, Available: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
    }

    const currentAllowance = await usdcContract.allowance(wallet.address, config.tokenRouterAddress);
    if (currentAllowance < params.amountIn) {
      console.log('Approving USDC for TokenRouter...');
      const approveTx = await usdcContract.approve(
        config.tokenRouterAddress,
        params.amountIn
      );
      console.log('Approval transaction hash:', approveTx.hash);
      await approveTx.wait();
      console.log('USDC approved successfully');
    }

    // Send transaction
    console.log('Sending fast market order...');
    console.log('From chain:', config.chainId);
    console.log('To chain:', params.targetChain);
    console.log('Amount:', ethers.formatUnits(params.amountIn, 6), 'USDC');
    console.log('Max fee:', ethers.formatUnits(params.maxFee, 6), 'USDC');

    const tx = await tokenRouterContract.placeFastMarketOrder(
      params.amountIn,
      params.targetChain,
      Buffer.from(params.redeemer.replace('0x', '').padStart(64, '0'), 'hex'),
      Buffer.from(params.redeemerMessage),
      params.maxFee,
      params.deadline,
      {
        gasLimit: GAS_LIMIT,
      }
    );

    console.log('Transaction sent! Hash:', tx.hash);
    console.log(`View on Wormhole Explorer: https://wormholescan.io/#/tx/${tx.hash}`);

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.transaction) {
      console.error('Transaction details:', {
        to: error.transaction.to,
        from: error.transaction.from,
        data: error.transaction.data,
      });
    }
    process.exit(1);
  }
})(); 