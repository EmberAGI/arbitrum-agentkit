import { type Address } from 'viem';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getChainConfigById } from './agent.js';
import type { Task } from 'a2a-samples-js/schema';

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<
    string,
    Array<{
      chainId: string;
      address: string;
      decimals: number;
      marketType?: 'PT' | 'YT' | 'SY';
    }>
  >;
  userAddress: Address | undefined;
  executeAction: (actionName: string, transactions: TransactionRequest[]) => Promise<string>;
  log: (...args: unknown[]) => Promise<void>;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

export interface TransactionRequest {
  to: Address;
  data: string;
  value?: string;
  chainId?: string;
  from?: Address;
}

/**
 * Parses a response from an MCP tool call
 */
export function parseMcpToolResponse(
  rawResponse: unknown,
  context: HandlerContext,
  toolName: string
): unknown {
  let dataToValidate: unknown;

  if (
    rawResponse &&
    typeof rawResponse === 'object' &&
    'content' in rawResponse &&
    Array.isArray((rawResponse as any).content) &&
    (rawResponse as any).content.length > 0 &&
    (rawResponse as any).content[0]?.type === 'text' &&
    typeof (rawResponse as any).content[0]?.text === 'string'
  ) {
    context.log(`Raw ${toolName} result appears nested, parsing inner text...`);
    try {
      const parsedData = JSON.parse((rawResponse as any).content[0].text);
      context.log('Parsed inner text content for validation:', parsedData);
      dataToValidate = parsedData;
    } catch (e) {
      context.log(`Error parsing inner text content from ${toolName} result:`, e);
      throw new Error(
        `Failed to parse nested JSON response from ${toolName}: ${(e as Error).message}`
      );
    }
  } else {
    context.log(
      `Raw ${toolName} result does not have expected nested structure, validating as is.`
    );
    dataToValidate = rawResponse;
  }

  return dataToValidate;
}

/**
 * Handles Pendle operations based on the provided arguments and context
 */
export async function handlePendleOperation(
  args: {
    operationType: 'stake' | 'unstake' | 'claim' | 'swap';
    marketType: 'PT' | 'YT' | 'SY';
    token?: string;
    amount?: string;
    toToken?: string;
    fromChain?: string;
  },
  context: HandlerContext
) {
  await context.log('Handling Pendle operation:', args);

  try {
    const { operationType, marketType, token, amount, toToken, fromChain } = args;
    const { userAddress, tokenMap } = context;

    if (!userAddress) {
      throw new Error('User address not set');
    }

    // For claim operations, token and amount are optional
    if (operationType !== 'claim' && (!token || !amount)) {
      throw new Error('Token and amount must be provided for this operation');
    }

    // For swap operations, toToken is required
    if (operationType === 'swap' && !toToken) {
      throw new Error('Destination token (toToken) must be provided for swap operations');
    }

    // Get token metadata if available
    let tokenInfo;
    if (token) {
      tokenInfo = tokenMap[token];
      if (!tokenInfo || tokenInfo.length === 0) {
        return {
          success: false,
          error: `Token '${token}' not found in available tokens`,
          availableTokens: Object.keys(tokenMap),
        };
      }
    }

    // Here we'd normally call the Pendle adapter to get the actual transaction data
    // For this example, we'll simulate the response with placeholder data
    
    // Simulate different operation responses
    switch (operationType) {
      case 'stake':
        return simulateStakeResponse(userAddress, marketType, token!, amount!);
      case 'unstake':
        return simulateUnstakeResponse(userAddress, marketType, token!, amount!);
      case 'claim':
        return simulateClaimResponse(userAddress, marketType);
      case 'swap':
        return simulateSwapResponse(userAddress, marketType, token!, toToken!, amount!);
      default:
        throw new Error(`Unsupported operation type: ${operationType}`);
    }
  } catch (error) {
    await context.log('Error in handlePendleOperation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Simulation functions for different Pendle operations
function simulateStakeResponse(userAddress: Address, marketType: 'PT' | 'YT' | 'SY', token: string, amount: string) {
  return {
    success: true,
    operation: 'stake',
    details: {
      userAddress,
      marketType,
      token,
      amount,
      // Returning sample transaction data for frontend to sign
      transaction: {
        to: '0xF1a26cA8245C138Cf88EB09b5F2Ab2c84DCA685B',
        data: '0x1234567890abcdef', // Sample transaction data
        value: '0',
        chainId: '1' // Ethereum Mainnet
      },
      estimatedGas: '150000',
    },
    message: `Prepared staking ${amount} ${token} in Pendle ${marketType} market - will be signed by frontend wallet`,
  };
}

function simulateUnstakeResponse(userAddress: Address, marketType: 'PT' | 'YT' | 'SY', token: string, amount: string) {
  return {
    success: true,
    operation: 'unstake',
    details: {
      userAddress,
      marketType,
      token,
      amount,
      // Returning sample transaction data for frontend to sign
      transaction: {
        to: '0x5B9aF4A97D1a8Ac2387E4c6f3C2C4B5969Dc522d',
        data: '0xabcdef1234567890', // Sample transaction data
        value: '0',
        chainId: '1' // Ethereum Mainnet
      },
      estimatedGas: '180000',
    },
    message: `Prepared unstaking ${amount} ${token} from Pendle ${marketType} market - will be signed by frontend wallet`,
  };
}

function simulateClaimResponse(userAddress: Address, marketType: 'PT' | 'YT' | 'SY') {
  return {
    success: true,
    operation: 'claim',
    details: {
      userAddress,
      marketType,
      // Returning sample transaction data for frontend to sign
      transaction: {
        to: '0xB5C3f2F9Ab114A5E12CC07dC725759C0Ac5e2570',
        data: '0x9876543210abcdef', // Sample transaction data
        value: '0',
        chainId: '1' // Ethereum Mainnet
      },
      estimatedGas: '120000',
      estimatedRewards: {
        'ETH': '0.05',
        'PENDLE': '25.0'
      }
    },
    message: `Prepared claiming rewards from Pendle ${marketType} market - will be signed by frontend wallet`,
  };
}

function simulateSwapResponse(userAddress: Address, marketType: 'PT' | 'YT' | 'SY', fromToken: string, toToken: string, amount: string) {
  return {
    success: true,
    operation: 'swap',
    details: {
      userAddress,
      marketType,
      fromToken,
      toToken,
      amount,
      // Returning sample transaction data for frontend to sign
      transaction: {
        to: '0xF1a26cA8245C138Cf88EB09b5F2Ab2c84DCA685B',
        data: '0xfedcba0987654321', // Sample transaction data
        value: '0',
        chainId: '1' // Ethereum Mainnet
      },
      estimatedGas: '200000',
      slippage: '0.5%',
      estimatedOutput: {
        token: toToken,
        amount: (parseFloat(amount) * 0.99).toString() // Simulating 1% fee
      }
    },
    message: `Prepared swapping ${amount} ${fromToken} to ${toToken} in Pendle ${marketType} market - will be signed by frontend wallet`,
  };
} 