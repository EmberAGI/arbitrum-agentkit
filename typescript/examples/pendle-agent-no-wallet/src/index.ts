import { Agent } from './agent.js';
import { type Address, isAddress } from 'viem';
import * as dotenv from 'dotenv';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import cors from 'cors';
import { z } from 'zod';
import type { Task } from 'a2a-samples-js/schema';

const PendleAgentSchema = z.object({
  instruction: z
    .string()
    .describe("A natural‑language Pendle instruction, e.g. 'Stake 10 ETH into Pendle YT market'."),
  userAddress: z
    .string()
    .describe('The user wallet address which is used to sign transactions and to pay for gas.'),
});
type PendleAgentArgs = z.infer<typeof PendleAgentSchema>;

dotenv.config();

const server = new McpServer({
  name: 'mcp-sse-pendle-agent-server',
  version: '1.0.0',
});

let agent: Agent;

const initializeAgent = async (): Promise<void> => {
  const quicknodeSubdomain = process.env.QUICKNODE_SUBDOMAIN;
  const apiKey = process.env.QUICKNODE_API_KEY;
  if (!quicknodeSubdomain || !apiKey) {
    throw new Error('QUICKNODE_SUBDOMAIN and QUICKNODE_API_KEY must be set in the .env file.');
  }

  agent = new Agent(quicknodeSubdomain, apiKey);
  await agent.init();
};

const agentToolName = 'askPendleAgent';
const agentToolDescription =
  'Sends a free‑form, natural‑language Pendle instruction to your Pendle AI agent and returns a structured response (stake, unstake, claim, swap).';

server.tool(
  agentToolName,
  agentToolDescription,
  PendleAgentSchema.shape,
  async (args: PendleAgentArgs) => {
    const { instruction, userAddress } = args;
    if (!isAddress(userAddress)) {
      throw new Error('Invalid user address provided.');
    }
    try {
      const taskResponse = await agent.processUserInput(instruction, userAddress);

      console.error('[server.tool] result', taskResponse);

      return {
        content: [{ type: 'text', text: JSON.stringify(taskResponse) }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      const errorTask: Task = {
        id: userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error: ${err.message}` }],
          },
        },
      };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(errorTask) }],
      };
    }
  }
);

const app = express();

app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    name: 'MCP SSE Pendle Agent Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      '/': 'Server information (this response)',
      '/sse': 'Server-Sent Events endpoint for MCP connection',
      '/messages': 'POST endpoint for MCP messages',
    },
    tools: [{ name: agentToolName, description: agentToolDescription }],
  });
});

const sseConnections = new Set();

let transport: SSEServerTransport;

app.get('/sse', async (_req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);

  sseConnections.add(res);

  const keepaliveInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepaliveInterval);
      return;
    }
    res.write(':keepalive\n\n');
  }, 30000);

  _req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });

  res.on('error', err => {
    console.error('SSE Error:', err);
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });
});

app.post('/messages', async (req, res) => {
  await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.error(`MCP SSE Pendle Agent Server running on port ${PORT}`);
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

main(); 