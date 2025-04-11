Unlock Intelligent On-Chain Workflows in TypeScript for the Arbitrum Ecosystem.

## Table of Contents

1.  [Introduction](#introduction)
2.  [Repository Organization](#repository-organization)
3.  [Quick Start](#quick-start)
4.  [Documentation](#documentation)
5.  [MCP Tools Integration](#mcp-tools-integration)
6.  [Contribution](#contribution)

## Introduction

AgentKit is a versatile toolkit for rapidly developing on-chain agents within the Arbitrum ecosystem. It enables autonomous on-chain operations—such as token transfers, swaps, and advanced DeFi interactions—while integrating on-chain and off-chain data sources to power robust workflows. AgentKit offers ready-to-use implementations and templates across various sectors, helping you build production-ready agents in minutes.

## Repository Organization

AgentKit follows a monorepo structure, primarily focused on TypeScript packages. A Rust implementation is planned for release in the near future. The repository layout is as follows:

```
agentkit/
├── typescript/
│   └── examples/
│       └── lending-agent/
│----── mcp-tools/
│       └── emberai-mcp/
├── CHANGELOG.md
├── CONTRIBUTIONS.md
├── LICENSE
├── README.md
```

## Quick Start

You can quickly get started and build a DeFi agent by following this guide and cloning the Github Repository.

### Set Up Your Local Environment

Ensure that you have Node.js 22+ installed and pnpm installed:

```bash
node -v # Should be 22+
pnpm -v # Check that pnpm is installed
```

Then, clone the repository and navigate to its directory:

```bash
git clone https://github.com/EmberAGI/arbitrum-agentkit.git
cd arbitrum-agentkit
```

You are now prepared to leverage the sample implementations within our examples subdirectory to extend your agent's capabilities.

## MCP Tools Integration

MCP tools enable seamless data integration between external providers and on-chain agents. By adapting existing APIs and SDKs into an MCP-compatible server, integrators can immediately take advantage of standardized functionality for tasks such as data retrieval and advanced blockchain interactions. The `mcp-tools` directory contains templates (`emberai-mcp/src/index.ts`) and guidelines for building these tools with minimal configuration, ensuring rapid implementation and a consistent development experience across different systems.

## Contribution

If you wish to contribute to the project, please follow the CONTRIBUTIONS.md guidelines.
