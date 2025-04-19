# Pendle Agent Example (No Wallet)

This example demonstrates how to build an AI agent that can interact with Pendle Finance using Vibekit. The agent can perform operations like staking, unstaking, claiming rewards, and swapping tokens in Pendle markets.

## What is Pendle Finance?

Pendle is a DeFi protocol that allows users to trade future yield. It separates yield-bearing assets into two tokens:

- **PT (Principal Token)**: Represents the principal amount of the asset
- **YT (Yield Token)**: Represents the yield accrued by the underlying asset
- **SY (Standard Yield)**: The standardized yield-bearing asset in Pendle

## Features

- Natural language processing of Pendle-related instructions
- Support for staking, unstaking, claiming, and swapping operations
- Integration with Pendle markets for PT, YT, and SY tokens
- Token metadata fetching and caching
- MCP (Model Context Protocol) integration

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Update the environment variables in `.env` with your actual values:
   - `OPENROUTER_API_KEY`: API key for OpenRouter
   - `MNEMONIC`: Your wallet mnemonic (for testing only)
   - `QUICKNODE_SUBDOMAIN` and `QUICKNODE_API_KEY`: Your QuickNode credentials
   - `PENDLE_API_KEY`: Your Pendle API key (if required)

## Running the Agent

### Local Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

### Docker

```bash
docker-compose up -d
```

## Usage

Once the agent is running, you can interact with it using natural language instructions via the MCP protocol. Examples:

- "Stake 10 ETH in Pendle YT market"
- "Unstake 5 ETH from Pendle PT"
- "Claim my Pendle yields"
- "Swap 10 PT-ETH to YT-ETH"

## API

The agent exposes an HTTP API with the following endpoints:

- `GET /`: Server information
- `GET /sse`: Server-Sent Events endpoint for MCP connection
- `POST /messages`: Endpoint for MCP messages

The agent provides a tool called `askPendleAgent` that accepts natural language instructions and returns structured responses for Pendle operations.

## Architecture

This agent follows the Model-Context Protocol (MCP) architecture, which allows it to be integrated with various AI systems. The core components are:

1. **Agent**: Handles the conversation state and orchestrates the interactions
2. **Tool Handlers**: Processes specific operations (stake, unstake, claim, swap)
3. **MCP Integration**: Connects the agent to AI models via the MCP protocol

## License

This project is licensed under the terms of the MIT license. 