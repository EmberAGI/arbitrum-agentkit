// Use the high-level McpServer API
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load env variables
dotenv.config();

// --- Define Zod Schemas ---
const getBalancesSchema = {
  chainId: z.string().describe("Numeric chain ID."),
  address: z.string().describe("User wallet address."),
};

// Define types from schemas
type GetBalancesParams = z.infer<typeof getBalancesParams>;

// Create Zod objects for inference
const getBalancesParams = z.object(getBalancesSchema);

// --- Initialize the MCP server using the high-level McpServer API
const server = new McpServer({
  name: "goldrush-mcp-tool-server",
  version: "1.0.0",
});

// --- Register Tools ---
server.tool(
  "getTokenBalances",
  "Fetch ERC-20 token balances from Covalent for a given address on a specified chain",
  getBalancesSchema,
  async (params: GetBalancesParams, _extra: any) => {
    console.error(`Executing getBalances tool with params:`, params);
    console.error(`Extra object for getBalances:`, _extra);
    try {
      const { chainId, address } = params;

      const apiKey = process.env.GOLD_RUSH_API_KEY;
      if (!apiKey) {
        throw new Error("GOLD_RUSH_API_KEY is missing in .env");
      }

      // Construct endpoint
      const endpoint = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?quote-currency=USD&format=JSON&key=${apiKey}`;

      // Make request
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(
          `Gold Rush request failed with status: ${response.status}`
        );
      }

      const data = await response.json();

      // Return data as text or JSON
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// 4. Start your server
async function main() {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    console.error("Gold Rush MCP server started and connected.");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();

// Run the server
main();
