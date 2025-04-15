import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration interfaces
interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  tokenRouterAddress: string;
}

// Chain configurations using Wormhole chain IDs
const chainConfigs: { [key: number]: ChainConfig } = {
  10003: {  // ArbitrumSepolia
    chainId: 10003,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    // https://github.com/wormhole-foundation/wormhole-dashboard/blob/main/watcher/src/fastTransfer/consts.ts#L90
    tokenRouterAddress: '0xe0418C44F06B0b0D7D1706E01706316DBB0B210E'
  },
  10005: {    // OptimismSepolia
    chainId: 10005,
    rpcUrl: 'https://sepolia.optimism.io',
    tokenRouterAddress: '0x6BAa7397c18abe6221b4f6C3Ac91C88a9faE00D8'
  }
};

// Token Router ABI
const tokenRouterAbi = [
  "function placeFastMarketOrder(uint64 amountIn, uint16 targetChain, bytes32 redeemer, bytes redeemerMessage, uint64 maxFee, uint32 deadline) external payable returns (uint64 sequence, uint64 fastSequence, uint256 protocolSequence)"
];

// USDC address for ArbitrumSepolia https://developers.circle.com/stablecoins/usdc-on-test-networks
const USDC_ARB_SEP_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

// Utility function to convert address to bytes32
function addressToBytes32(address: string): Buffer {
  return Buffer.from(address.replace('0x', '').padStart(64, '0'), 'hex');
}

interface FastMarketOrderParams {
  amountIn: bigint;  // uint64
  targetChain: number;  // uint16
  redeemer: string;
  redeemerMessage: string;
  maxFee: bigint;  // uint64
  deadline: number;  // uint32
}

(async () => {
  try {
    // Set up the provider and wallet
    const originChainId = 10003; // ArbitrumSepolia
    const config = chainConfigs[originChainId];
    
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY not found in environment variables');
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Create contract instance
    const tokenRouterContract = new ethers.Contract(
      config.tokenRouterAddress,
      tokenRouterAbi,
      wallet // Use wallet instead of provider to sign transactions
    );

    const targetChain = 10005; // Wormhole chain ID for OptimismSepolia

    // Define order parameters
    const params: FastMarketOrderParams = {
       // 100 USDC is the minimum amount https://github.com/wormhole-foundation/example-liquidity-layer/blob/d0228f02c055f85eefbc09b5d667e45480abd13f/evm/src/TokenRouter/assets/State.sol#L35
      amountIn: BigInt("101000000"),
      targetChain,             
      redeemer: "0x08Ab1Ce3686cb7E616af2D3E068356B160c4c038",
      redeemerMessage: "Epoch Test",
      maxFee: BigInt("100000"), // 0.1 USDC
      deadline: Math.floor(Date.now() / 1000) + 3600  // 1 hour from now
    };

    // Basic validation
    if (params.amountIn <= params.maxFee) {
      throw new Error(`amountIn (${params.amountIn}) must be greater than maxFee (${params.maxFee})`);
    }

    // Create USDC contract instance with minimal ABI
    const tokenContract = new ethers.Contract(
      USDC_ARB_SEP_ADDRESS,
      ['function approve(address spender, uint256 amount) public returns (bool)'],
      wallet
    );

    // Check current allowance
    const allowanceAbi = ["function allowance(address owner, address spender) external view returns (uint256)"];
    const allowanceContract = new ethers.Contract(USDC_ARB_SEP_ADDRESS, allowanceAbi, wallet);
    const currentAllowance = await allowanceContract.allowance(wallet.address, config.tokenRouterAddress);
    console.log('Current USDC allowance:', currentAllowance.toString());

    // Only approve if current allowance is insufficient
    if (currentAllowance < params.amountIn) {
        console.log('Current allowance insufficient, approving USDC for TokenRouter...');
        console.log('Approving amount:', params.amountIn.toString());
        console.log('Spender address:', config.tokenRouterAddress);
        
        const approveTx = await tokenContract.approve(
            config.tokenRouterAddress,
            params.amountIn
        );
        console.log('Approval transaction hash:', approveTx.hash);
        await approveTx.wait();
        console.log('USDC approved for TokenRouter');
    } else {
        console.log('Current allowance sufficient, proceeding with fast market order');
    }

    // Continue with the fast market order
    console.log('Sending fast market order...');
    console.log('From chain:', originChainId);
    console.log('To chain:', params.targetChain);
    console.log('Amount:', params.amountIn.toString());

    // Log wallet info
    console.log('Wallet address:', wallet.address);
    console.log('Using contract:', config.tokenRouterAddress);

    const usdcAbi = ["function balanceOf(address account) external view returns (uint256)"];
    const usdcContract = new ethers.Contract(USDC_ARB_SEP_ADDRESS, usdcAbi, wallet);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    console.log('USDC Balance:', usdcBalance.toString());

    // Log full parameters
    console.log('Full params:', {
        amountIn: params.amountIn.toString(),
        targetChain: params.targetChain,
        redeemer: params.redeemer,
        maxFee: params.maxFee.toString(),
        deadline: params.deadline
    });

    // Send transaction
    console.log('Sending fast market order...');
    // Use a higher fixed gas limit for complex contract interactions
    const tx = await tokenRouterContract.placeFastMarketOrder(
      params.amountIn,
      params.targetChain,
      addressToBytes32(params.redeemer),
      Buffer.from(params.redeemerMessage),
      params.maxFee,
      params.deadline,
      { 
        gasLimit: 1000000
      }
    );

    console.log('Transaction sent! Hash:', tx.hash);

    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    // Log the sequence numbers
    const [sequence, fastSequence, protocolSequence] = receipt.logs[0].args;
    console.log('Sequence:', sequence.toString());
    console.log('Fast Sequence:', fastSequence.toString());
    console.log('Protocol Sequence:', protocolSequence.toString());
    
    console.log(`View on Wormhole Explorer: https://wormholescan.io/#/tx/${tx.hash}`);

  } catch (error: any) {
    console.error('Error details:', {
        message: error.message,
        code: error.code,
        transaction: {
            to: error.transaction?.to,
            from: error.transaction?.from,
            data: error.transaction?.data,
            value: error.transaction?.value?.toString()
        },
        data: error.data,
        reason: error.reason
    });
    
    process.exit(1);
  }
})(); 