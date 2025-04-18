import { z } from 'zod';
import {
  parseUnits,
  createPublicClient,
  http,
  type Address,
  encodeFunctionData,
  type PublicClient,
} from 'viem';
import { getChainConfigById } from './agent.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task } from 'a2a-samples-js/schema';

export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

export const SwapPreviewSchema = z
  .object({
    fromToken: z.string(),
    toToken: z.string(),
    amount: z.string(),
    fromChain: z.string(),
    toChain: z.string(),
  })
  .passthrough();

export type SwapPreview = z.infer<typeof SwapPreviewSchema>;

export const TransactionRequestSchema = z
  .object({
    to: z.string(),
    data: z.string(),
    value: z.string().optional(),
    chainId: z.string(),
  })
  .passthrough();

export type TransactionRequest = z.infer<typeof TransactionRequestSchema>;

export const TransactionArtifactSchema = z.object({
  txPreview: SwapPreviewSchema,
  txPlan: z.array(TransactionRequestSchema),
});

export type TransactionArtifact = z.infer<typeof TransactionArtifactSchema>;

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress: string | undefined;
  executeAction: (actionName: string, transactions: TransactionRequest[]) => Promise<string>;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo[]>,
  tokenName: string
): TokenInfo[] | undefined {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key];
    }
  }
  return undefined;
}

const chainMappings = [
  { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
  { id: '42161', name: 'Arbitrum', aliases: [] },
  { id: '10', name: 'Optimism', aliases: [] },
  { id: '137', name: 'Polygon', aliases: ['matic'] },
  { id: '8453', name: 'Base', aliases: [] },
];

function mapChainNameToId(chainName: string): string | undefined {
  const normalized = chainName.toLowerCase();
  const found = chainMappings.find(
    mapping => mapping.name.toLowerCase() === normalized || mapping.aliases.includes(normalized)
  );
  return found?.id;
}

function mapChainIdToName(chainId: string): string {
  const found = chainMappings.find(mapping => mapping.id === chainId);
  return found?.name || chainId;
}

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, TokenInfo[]>,
  direction: 'from' | 'to'
): TokenInfo | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens === undefined) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: TokenInfo | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens?.find(token => token.chainId === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens?.map(t => mapChainIdToName(t.chainId)).join(', ')}`
      );
    }
  } else {
    if (!tokens || tokens.length === 0) {
      throw new Error(`Token ${tokenName} not supported.`);
    }
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId)}`)
        .join('\n');
      return `Multiple chains supported for ${tokenName}:\n${chainList}\nPlease specify the '${direction}Chain'.`;
    }
    tokenDetail = tokens[0];
  }

  if (!tokenDetail) {
    throw new Error(
      `Could not resolve token details for ${tokenName}${optionalChainName ? ' on chain ' + optionalChainName : ''}.`
    );
  }

  return tokenDetail;
}

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

function validateAction(
  actionName: string,
  rawTransactions: unknown,
  context: HandlerContext
): Array<TransactionRequest> {
  const validationResult = z.array(TransactionRequestSchema).safeParse(rawTransactions);
  if (!validationResult.success) {
    const errorMsg = `MCP tool '${actionName}' returned invalid transaction data.`;
    context.log('Validation Error:', errorMsg, validationResult.error);
    throw new Error(errorMsg);
  }
  return validationResult.data;
}

const minimalErc20Abi = [
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export async function handleSwapTokens(
  params: {
    fromToken: string;
    toToken: string;
    amount: string;
    fromChain?: string;
    toChain?: string;
  },
  context: HandlerContext
): Promise<Task> {
  if (!context.userAddress) {
    throw new Error('User address not set!');
  }
  const { fromToken, toToken, amount, fromChain, toChain } = params;

  const fromTokenResult = findTokenDetail(fromToken, fromChain, context.tokenMap, 'from');
  if (typeof fromTokenResult === 'string') {
    return {
      id: context.userAddress,
      status: {
        state: 'input-required',
        message: { role: 'agent', parts: [{ type: 'text', text: fromTokenResult }] },
      },
    };
  }
  const fromTokenDetail = fromTokenResult;

  const toTokenResult = findTokenDetail(toToken, toChain, context.tokenMap, 'to');
  if (typeof toTokenResult === 'string') {
    return {
      id: context.userAddress,
      status: {
        state: 'input-required',
        message: { role: 'agent', parts: [{ type: 'text', text: toTokenResult }] },
      },
    };
  }
  const toTokenDetail = toTokenResult;

  const atomicAmount = parseUnits(amount, fromTokenDetail.decimals);

  context.log(
    `Executing swap via MCP: ${fromToken} (address: ${fromTokenDetail.address}, chain: ${fromTokenDetail.chainId}) to ${toToken} (address: ${toTokenDetail.address}, chain: ${toTokenDetail.chainId}), amount: ${amount}, atomicAmount: ${atomicAmount}, userAddress: ${context.userAddress}`
  );

  const rawTransactions = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: {
      fromTokenAddress: fromTokenDetail.address,
      fromTokenChainId: fromTokenDetail.chainId,
      toTokenAddress: toTokenDetail.address,
      toTokenChainId: toTokenDetail.chainId,
      amount: atomicAmount.toString(),
      userAddress: context.userAddress,
    },
  });

  const dataToValidate = parseMcpToolResponse(rawTransactions, context, 'swapTokens');

  if (!Array.isArray(dataToValidate) || dataToValidate.length === 0) {
    context.log('Invalid or empty transaction plan received from MCP tool:', dataToValidate);
    if (
      typeof dataToValidate === 'object' &&
      dataToValidate !== null &&
      'error' in dataToValidate
    ) {
      throw new Error(`MCP tool returned an error: ${JSON.stringify(dataToValidate)}`);
    }
    throw new Error('Expected a transaction plan array from MCP tool, but received invalid data.');
  }

  const swapTx = dataToValidate[0] as TransactionRequest;
  if (!swapTx || typeof swapTx !== 'object' || !swapTx.to) {
    context.log('Invalid swap transaction object received from MCP:', swapTx);
    throw new Error('Invalid swap transaction structure in plan.');
  }

  const spenderAddress = swapTx.to as Address;
  const txChainId = fromTokenDetail.chainId;
  const fromTokenAddress = fromTokenDetail.address as Address;
  const userAddress = context.userAddress as Address;

  context.log(
    `Checking allowance: User ${userAddress} needs to allow Spender ${spenderAddress} to spend ${atomicAmount} of Token ${fromTokenAddress} on Chain ${txChainId}`
  );

  let tempPublicClient: PublicClient;
  try {
    const chainConfig = getChainConfigById(txChainId);
    const networkSegment = chainConfig.quicknodeSegment;
    const targetChain = chainConfig.viemChain;
    let dynamicRpcUrl: string;
    if (networkSegment === '') {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
    } else {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
    }
    tempPublicClient = createPublicClient({
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });
    context.log(`Public client created for chain ${txChainId} via ${dynamicRpcUrl.split('/')[2]}`);
  } catch (chainError) {
    context.log(`Failed to create public client for chain ${txChainId}:`, chainError);
    throw new Error(`Unsupported chain or configuration error for chainId ${txChainId}.`);
  }

  let currentAllowance: bigint = 0n;
  try {
    currentAllowance = await tempPublicClient.readContract({
      address: fromTokenAddress,
      abi: minimalErc20Abi,
      functionName: 'allowance',
      args: [userAddress, spenderAddress],
    });
    context.log(`Successfully read allowance: ${currentAllowance}. Required: ${atomicAmount}`);
  } catch (readError) {
    context.log(
      `Warning: Failed to read allowance via readContract (eth_call may be unsupported). Error: ${(readError as Error).message}`
    );
    context.log('Assuming allowance is insufficient due to check failure.');
  }

  let approveTx: TransactionRequest | undefined;
  if (currentAllowance < atomicAmount) {
    context.log(
      `Insufficient allowance or check failed. Need ${atomicAmount}, have ${currentAllowance}. Creating approval transaction...`
    );
    approveTx = {
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: minimalErc20Abi,
        functionName: 'approve',
        args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)],
      }),
      value: '0',
      chainId: txChainId,
    };
  } else {
    context.log('Sufficient allowance already exists.');
  }

  context.log('Proceeding to validate the swap transaction received from MCP tool...');

  if (Array.isArray(dataToValidate) && dataToValidate.length > 0) {
    const swapTxPlan = dataToValidate[0] as Partial<TransactionRequest>;
    if (swapTxPlan && typeof swapTxPlan === 'object' && !swapTxPlan.chainId) {
      context.log(`Adding missing chainId (${txChainId}) to swap transaction plan.`);
      swapTxPlan.chainId = txChainId;
    }
  }

  const swapTxPlan = validateAction('swapTokens', dataToValidate, context);
  const txPlan = [...(approveTx ? [approveTx] : []), ...swapTxPlan];

  const txArtifact: TransactionArtifact = {
    txPreview: {
      fromToken: fromToken,
      toToken: toToken,
      amount: amount,
      fromChain: mapChainIdToName(fromTokenDetail.chainId),
      toChain: mapChainIdToName(toTokenDetail.chainId),
    },
    txPlan: txPlan,
  };

  return {
    id: context.userAddress,
    status: {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: 'Transaction plan successfully created. Ready to sign.' }],
      },
    },
    artifacts: [
      {
        name: 'transaction-plan',
        parts: [
          {
            type: 'data',
            data: txArtifact,
          },
        ],
      },
    ],
  };
}
