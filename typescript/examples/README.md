## Introduction

This section contains example implementations of on-chain AI agents, illustrating how they are easily built and deployed using the Arbitrum Agentkit. These agents act as MCP tools for compatibility with any system.

## Setting Up Your Project

To run an agent, you need to first set up your project by following these steps:

### 1. Setup Environment :

Copy the contents of `.env.example` into the `.env` file in your agent's directory and fill in any required secrets or configuration variables.

### 2. Install Packages:

Install the necessary packages by running the following command:

```bash
pnpm install
```

## Running an Agent

There are two main ways to start an agent:

### 1. Using Docker Compose

Build the MCP-enabled Docker image in the agent's directory and run the container to start your agent.

### 2. Local Development

- **Using the Inspector via npx**:

  ```bash
  pnpm run inspect:npx
  ```

  This command uses `npx -y @modelcontextprotocol/inspector` to launch the Inspector, pointing it at your agent’s compiled code (`./dist/index.js`). It’s a convenient way to inspect or interact with your production agent without modifying your local environment.

- **Using npm**:

  ```bash
  pnpm run build
  pnpm run start
  ```

  The agent should now be running and ready to receive requests or user input.

## Graphical MCP Clients

Although the above examples primarily demonstrate command-line interactions, you can also integrate agents into graphical MCP clients such as:

### 1. Cursor

Cursor is designed for lightweight command-line interactions. To integrate an agent into Cursor, update the configuration by editing the `mcp.json` file. Add an entry under the `mcpServers` key to define the agent’s settings. Cursor can run an agent via a local command (using npx) or point directly to an SSE (Server-Sent Events) endpoint. The contents of the `mcp.json` file follow this structure:

```json
{
  "mcpServers": {
    "local-npx-agent": {
      "command": "npx",
      "args": ["/path/to/agent/build/dist/index.js"],
      "env": {
        "VAR": "value"
      }
    },
    "local-sse-agent": {
      "url": "http://localhost:3010/sse",
      "env": {
        "VAR": "value"
      }
    },
    "remote-sse-agent": {
      "url": "http://173.230.139.151:3010/sse"
    }
  }
}
```

For detailed guidance on configuring MCP for Cursor, refer to https://docs.cursor.com/context/model-context-protocol.

### 2. Claude Desktop

Claude Desktop supports similar agent configurations as Cursor but also includes additional settings, such as filesystem access, which enhances its capability to work with local directories. To integrate an agent into Claude Desktop, update the configuration by editing the `claude_desktop_config.json` file. Add an entry under the `mcpServers` key to define the agent’s settings. Claude Desktop can run an agent via a local command (using npx) or point directly to an SSE (Server-Sent Events) endpoint. The contents of the `claude_desktop_config.json` file follow this structure:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    },
    "MCP_DOCKER": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "alpine/socat",
        "STDIO",
        "TCP:host.docker.internal:8811"
      ],
      "local-sse-agent": {
        "url": "http://localhost:3010/sse",
        "env": {
          "VAR": "value"
        }
      },
      "remote-sse-agent": {
        "url": "http://173.230.139.151:3010/sse"
      }
    }
  }
}
```

For detailed guidance on configuring MCP for Claude Desktop, refer to https://modelcontextprotocol.io/quickstart/user.

### 3. Windsurf

Windsurf offers a rich graphical interface and integrates its MCP configurations either through a configuration file named `windsurf_config.json` or via its built-in Settings panel. Windsurf’s configuration process often involves UI-based adjustments, but the contents of the `windsurf_config.json` file follows this structure:

```json
{
  "mcpServers": {
    "local-npx-agent": {
      "command": "npx",
      "args": ["/path/to/agent/build/dist/index.js"],
      "env": {
        "VAR": "value"
      }
    },
    "local-sse-agent": {
      "url": "http://localhost:3010/sse",
      "env": {
        "VAR": "value"
      }
    },
    "remote-sse-agent": {
      "url": "http://173.230.139.151:3010/sse"
    }
  }
}
```

For detailed guidance on configuring MCP for Windsurf, refer to https://docs.windsurf.com/windsurf/mcp.
