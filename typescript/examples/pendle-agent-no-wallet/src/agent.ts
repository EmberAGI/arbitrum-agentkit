import { z } from 'zod';
import {
  type Address,
  type Hex,
  type TransactionReceipt,
  BaseError,
  ContractFunctionRevertedError,
  hexToString,
  isHex,
  createWalletClient,
  createPublicClient,
  http,
  type LocalAccount,
} from 'viem';
import type { HandlerContext, TransactionRequest } from './agentToolHandlers.js';
import { handlePendleOperation, parseMcpToolResponse } from './agentToolHandlers.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateText,
  tool,
  type Tool,
  type CoreMessage,
  type ToolResultPart,
  type CoreUserMessage,
  type CoreAssistantMessage,
  type StepResult,
} from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { mainnet, arbitrum, optimism, polygon, base } from 'viem/chains';
import type { Chain } from 'viem/chains';
import type { Task } from 'a2a-samples-js/schema';
import { createRequire } from 'module';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'pendle_capabilities.json');

// Define the possible Pendle operations
enum PendleOperationType {
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  CLAIM = 'claim',
  SWAP = 'swap',
}

// Schema for Pendle operations
const PendleOperationSchema = z.object({
  operationType: z.nativeEnum(PendleOperationType)
    .describe('The type of Pendle operation to perform (stake, unstake, claim, swap).'),
  marketType: z.enum(['PT', 'YT', 'SY'])
    .describe('The Pendle market type (PT: Principal Token, YT: Yield Token, SY: Standard Yield).'),
  token: z
    .string()
    .describe('The symbol of the token to use for the operation. It may be lowercase or uppercase.'),
  amount: z
    .string()
    .describe('The amount to stake, unstake, or swap. It will be in a human readable format, e.g. "1.02 ETH" will be 1.02.'),
  toToken: z
    .string()
    .optional()
    .describe('For swap operations, the symbol of the token to swap to. Optional for other operations.'),
  fromChain: z
    .string()
    .optional()
    .describe('Optional chain name for the source token.'),
});

type PendleOperationArgs = z.infer<typeof PendleOperationSchema>;

// Schema for Pendle market tokens from MCP
const McpPendleTokenSchema = z
  .object({
    symbol: z.string().optional(),
    name: z.string().optional(),
    decimals: z.number().optional(),
    tokenUid: z
      .object({
        chainId: z.string().optional(),
        address: z.string().optional(),
      })
      .optional(),
    marketType: z.enum(['PT', 'YT', 'SY']).optional(),
  })
  .passthrough();

const McpPendleCapabilitySchema = z
  .object({
    protocol: z.string().optional(),
    capabilityId: z.string().optional(),
    supportedTokens: z.array(McpPendleTokenSchema).optional(),
  })
  .passthrough();

const McpSinglePendleCapabilityEntrySchema = z
  .object({
    pendleCapability: McpPendleCapabilitySchema.optional(),
  })
  .passthrough();

const McpGetPendleCapabilitiesResponseSchema = z.object({
  capabilities: z.array(McpSinglePendleCapabilityEntrySchema),
});

type McpGetPendleCapabilitiesResponse = z.infer<typeof McpGetPendleCapabilitiesResponseSchema>;

function logError(...args: unknown[]) {
  console.error(...args);
}

type PendleToolSet = {
  pendleOperation: Tool<typeof PendleOperationSchema, Awaited<ReturnType<typeof handlePendleOperation>>>;
};

interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

const chainIdMap: Record<string, ChainConfig> = {
  '1': { viemChain: mainnet, quicknodeSegment: '' },
  '42161': { viemChain: arbitrum, quicknodeSegment: 'arbitrum-mainnet' },
  '10': { viemChain: optimism, quicknodeSegment: 'optimism' },
  '137': { viemChain: polygon, quicknodeSegment: 'matic' },
  '8453': { viemChain: base, quicknodeSegment: 'base-mainnet' },
};

export function getChainConfigById(chainId: string): ChainConfig {
  const config = chainIdMap[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}. Please update chainIdMap.`);
  }
  return config;
}

export class Agent {
  private userAddress: Address | undefined;
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
  private tokenMap: Record<
    string,
    Array<{
      chainId: string;
      address: string;
      decimals: number;
      marketType?: 'PT' | 'YT' | 'SY';
    }>
  > = {};
  private availableTokens: string[] = [];
  public conversationHistory: CoreMessage[] = [];
  private mcpClient: Client | null = null;
  private toolSet: PendleToolSet | null = null;

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
  }

  async log(...args: unknown[]) {
    console.error(...args);
  }

  private getHandlerContext(): HandlerContext {
    if (!this.mcpClient) {
      throw new Error('MCP Client not initialized!');
    }

    const context: HandlerContext = {
      mcpClient: this.mcpClient,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      executeAction: this.executeAction.bind(this),
      log: this.log.bind(this),
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
    };
    return context;
  }

  async init() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an assistant that provides access to Pendle Finance operations via Ember AI Onchain Actions.

<examples>
<example>
<user>stake 10 ETH in Pendle YT market</user>
<parameters>
<operationType>stake</operationType>
<marketType>YT</marketType>
<token>ETH</token>
<amount>10</amount>
</parameters>
</example>

<example>
<user>unstake 5 ETH from Pendle PT</user>
<parameters>
<operationType>unstake</operationType>
<marketType>PT</marketType>
<token>ETH</token>
<amount>5</amount>
</parameters>
</example>

<example>
<user>claim my Pendle yields</user>
<parameters>
<operationType>claim</operationType>
<marketType>YT</marketType>
</parameters>
</example>

<example>
<user>swap 10 PT-ETH to YT-ETH</user>
<parameters>
<operationType>swap</operationType>
<marketType>PT</marketType>
<token>ETH</token>
<amount>10</amount>
<toToken>YT-ETH</toToken>
</parameters>
</example>
</examples>

You are an expert in Pendle Finance, which is a DeFi protocol for tokenizing yield. 
- PT (Principal Token): Represents the principal amount of an asset.
- YT (Yield Token): Represents the yield accrued by the underlying asset.
- SY (Standard Yield): The standardized yield-bearing asset in Pendle.

For any user query, determine what Pendle operation they want to perform (stake, unstake, claim, swap) 
and extract the relevant parameters. If critical information is missing, ask follow-up questions.

IMPORTANT: This is a no-wallet implementation. You will only prepare transactions that will be signed by the frontend connected wallet. Do not attempt to execute transactions yourself.
`,
      },
    ];

    // Create cache directory if it doesn't exist
    try {
      await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
    }

    this.log('Initializing MCP client via stdio...');
    try {
      this.mcpClient = new Client(
        { name: 'PendleAgentNoWallet', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const require = createRequire(import.meta.url);
      const mcpToolPath = require.resolve('ember-mcp-tool-server');

      const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpToolPath],
        env: {
          ...process.env, // Inherit existing environment variables
          EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051',
        },
      });

      await this.mcpClient.connect(transport);
      this.log('MCP client initialized successfully.');

      // Fetch and cache capabilities
      await this.fetchAndCacheCapabilities();
      
      // Create tools
      this.toolSet = {
        pendleOperation: tool({
          description: 'Perform operations on Pendle markets (stake, unstake, claim, swap)',
          parameters: PendleOperationSchema,
          execute: async args => {
            this.log('Calling handler: pendleOperation', args);
            try {
              return await handlePendleOperation(args, this.getHandlerContext());
            } catch (error: any) {
              logError(`Error during pendleOperation: ${error.message}`);
              throw error;
            }
          },
        }),
      };
    } catch (error) {
      console.error('Failed to initialize agent:', error);
      throw error;
    }
  }

  async start() {
    await this.init();
    this.log('Agent started.');
  }

  async stop() {
    if (this.mcpClient) {
      this.log('Closing MCP client...');
      try {
        await this.mcpClient.close();
        this.log('MCP client closed.');
      } catch (error) {
        logError('Error closing MCP client:', error);
      }
    }
  }

  async processUserInput(userInput: string, userAddress: Address): Promise<Task> {
    if (!this.toolSet) {
      throw new Error('Agent not initialized. Call start() first.');
    }
    this.userAddress = userAddress;
    const userMessage: CoreUserMessage = { role: 'user', content: userInput };
    this.conversationHistory.push(userMessage);

    try {
      this.log('Calling generateText with Vercel AI SDK...');
      const { response, text, toolCalls, toolResults, finishReason } = await generateText({
        model: openrouter('anthropic/claude-3-opus-20240229'),
        messages: this.conversationHistory,
        tools: this.toolSet,
        maxSteps: 10,
        onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
          this.log(`Step finished. Reason: ${stepResult.finishReason}`);
        },
      });
      this.log(`generateText finished. Reason: ${finishReason}`);

      response.messages.forEach((msg, index) => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          msg.content.forEach(part => {
            if (part.type === 'tool-call') {
              this.log(`[LLM Request ${index}]: Tool Call - ${part.toolName}`);
            }
          });
        } else if (msg.role === 'tool') {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((toolResult: ToolResultPart) => {
              this.log(
                `[Tool Result ${index} for ${toolResult.toolName}]: ${JSON.stringify(toolResult.result)}`
              );
            });
          }
        }
      });

      this.conversationHistory.push(...response.messages);

      // --- Process Tool Results from response.messages ---
      let processedToolResult: Task | null = null;
      for (const message of response.messages) {
        if (message.role === 'tool' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'tool-result' && part.toolName === 'pendleOperation') {
              this.log(`Processing tool result for ${part.toolName} from response.messages`);
              // Log the raw result for debugging
              this.log(`Raw toolResult.result: ${JSON.stringify(part.result)}`);
              // Assert the type
              processedToolResult = part.result as Task;
              // Now you can safely access properties based on the asserted type
              this.log(`PendleOperation Result State: ${processedToolResult?.status?.state ?? 'N/A'}`);
              // Check if the first part is a text part before accessing .text
              const firstPart = processedToolResult?.status?.message?.parts[0];
              const messageText = firstPart && firstPart.type === 'text' ? firstPart.text : 'N/A';
              this.log(`PendleOperation Result Message: ${messageText}`);
              // Break if you only expect one result or handle multiple if needed
              break;
            }
          }
        }
        if (processedToolResult) break; // Exit outer loop once result is found
      }
      // --- End Process Tool Results ---

      if (!processedToolResult) {
        throw new Error('No specific action result found.');
      }

      switch (processedToolResult.status.state) {
        case 'completed':
        case 'failed':
        case 'canceled':
          // Important to clear the conversation history after a Task has finished
          this.conversationHistory = [];
          return processedToolResult;
        case 'input-required':
        case 'submitted':
        case 'working':
        case 'unknown':
          return processedToolResult;
      }
    } catch (error) {
      const errorResponse = `Error calling Vercel AI SDK generateText: ${error}`;
      logError(errorResponse);
      const errorAssistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: errorResponse,
      };
      this.conversationHistory.push(errorAssistantMessage);
      throw new Error(errorResponse);
    }
  }

  async executeAction(actionName: string, transactions: TransactionRequest[]): Promise<string> {
    if (!this.userAddress) {
      throw new Error('User address not set');
    }

    if (!transactions || transactions.length === 0) {
      this.log(`${actionName}: No transactions required.`);
      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)}: No on-chain transactions required.`;
    }

    // This is a read-only agent, the frontend is responsible for signing and sending transactions
    // Just return the transaction information for the frontend
    this.log(`Preparing ${transactions.length} transaction(s) for ${actionName} to be signed by frontend`);
    return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} prepared with ${transactions.length} transaction(s) for frontend signing`;
  }

  private async fetchAndCacheCapabilities(): Promise<McpGetPendleCapabilitiesResponse> {
    try {
      // Try to read from cache first
      try {
        const cacheData = await fs.readFile(CACHE_FILE_PATH, 'utf8');
        const cachedCapabilities = JSON.parse(cacheData);
        if (cachedCapabilities) {
          console.log('Using cached Pendle capabilities');
          return cachedCapabilities;
        }
      } catch (error) {
        // Cache file doesn't exist or is invalid, continue with fetching
      }

      // Fetch capabilities from MCP
      if (!this.mcpClient) {
        throw new Error('MCP client not initialized');
      }

      // This is a placeholder for actual MCP capability fetching
      // In a real implementation, you would call the MCP API
      const pendleCapabilitiesResponse: McpGetPendleCapabilitiesResponse = {
        capabilities: [
          {
            pendleCapability: {
              protocol: 'Pendle',
              capabilityId: 'PENDLE_STAKE',
              supportedTokens: [
                {
                  symbol: 'PT-ETH',
                  name: 'Pendle Principal Token - ETH',
                  decimals: 18,
                  tokenUid: {
                    chainId: '1',
                    address: '0xF1a26cA8245C138Cf88EB09b5F2Ab2c84DCA685B',
                  },
                  marketType: 'PT',
                },
                {
                  symbol: 'YT-ETH',
                  name: 'Pendle Yield Token - ETH',
                  decimals: 18,
                  tokenUid: {
                    chainId: '1',
                    address: '0x5B9aF4A97D1a8Ac2387E4c6f3C2C4B5969Dc522d',
                  },
                  marketType: 'YT',
                },
                {
                  symbol: 'SY-ETH',
                  name: 'Pendle Standard Yield - ETH',
                  decimals: 18,
                  tokenUid: {
                    chainId: '1',
                    address: '0xB5C3f2F9Ab114A5E12CC07dC725759C0Ac5e2570',
                  },
                  marketType: 'SY',
                },
              ],
            },
          },
        ],
      };

      // Process and store token information
      for (const capability of pendleCapabilitiesResponse.capabilities) {
        if (!capability.pendleCapability?.supportedTokens) continue;
        
        for (const token of capability.pendleCapability.supportedTokens) {
          if (!token.symbol || !token.tokenUid?.chainId || !token.tokenUid?.address) continue;
          
          // Initialize array if it doesn't exist yet
          if (!this.tokenMap[token.symbol]) {
            this.tokenMap[token.symbol] = [];
            this.availableTokens.push(token.symbol);
          }
          
          // Type assertion to tell TypeScript that this array definitely exists
          (this.tokenMap[token.symbol] as Array<{
            chainId: string;
            address: string;
            decimals: number;
            marketType?: 'PT' | 'YT' | 'SY';
          }>).push({
            chainId: token.tokenUid.chainId,
            address: token.tokenUid.address,
            decimals: token.decimals ?? 18,
            marketType: token.marketType,
          });
        }
      }

      // Cache the results
      await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(pendleCapabilitiesResponse), 'utf8');
      
      return pendleCapabilitiesResponse;
    } catch (error) {
      console.error('Error fetching Pendle capabilities:', error);
      throw error;
    }
  }
} 