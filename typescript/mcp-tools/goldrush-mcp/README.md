# GoldRush `getTokenBalances` MCP Tool

The `getTokenBalances` tool fetches ERC‑20 token balances for any EVM wallet through Covalent’s GoldRush API and expose them as a MCP tool for AgentKit.

## Features

- Works on 75+ EVM chains supported by Covalent.

- Free‑tier friendly.

- Consistent with the rest of AgentKit’s built‑in MCP tools.

## Prerequisites

- Node.js version 18.x

- pnpm 8.x

- GoldRush API key (Free or paid)

## Package Installation

```bash
pnpm install
```

## Environment Variables

Copy the contents of `.env.example` into the `.env` file and fill in your API keys.

## Run Server

Run the following command to launch the Inspector via npx:

```bash
pnpm run inspect:npx
```

## Tool Usage

From the Inspector UI, send a request by providing a chain ID and a wallet address:

```js
{
  method: "tools/call";
  params: {
    name: "getTokenBalances";
    arguments: {
      chainId: "1";
      address: "0x84...a7b83";
    }
    _meta: {
      progressToken: 0;
    }
  }
}
```

Your response will have the following format:

```js
{
  data: {
    address: "0x84...a7b83";
    updated_at: "2025-04-09T16:46:25.664701308Z";
    next_update_at: "2025-04-09T16:51:25.664701778Z";
    quote_currency: "USD";
    chain_id: 1;
    chain_name: "eth-mainnet";
    items: [
      {
        contract_ticker_symbol: "ETH",
        balance: "1234567890000000000",
        quote: 4200.15,
        // More fields
      },
      {
        contract_ticker_symbol: "USDC",
        balance: "250000000",
        quote: 250000.0,
        // More fields
      },
      // More items
    ];
    pagination: null;
  }
  error: false;
  error_message: null;
  error_code: null;
}
```

## Troubleshooting

### 1. `SSE connection not established`

**Likely Cause:** Inspector launched without `--stdio` flag

**Fix:** Start Inspector with `--stdio` to match the server transport.

### 2. `Gold Rush request failed with status: 401`

**Likely Cause:** Invalid or missing API key

**Fix:** Verify `GOLD_RUSH_API_KEY` in `.env`.

### 3. `Error [ERR_HTTP_HEADERS_SENT]`

**Likely Cause:** Duplicate call to `main()` or mismatched transport

**Fix:** Ensure only one `main()` call and matching Inspector flag.
