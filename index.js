#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createWallet, getWalletAddress, getBalance, transfer, collectFees } from "./lib/wallet.js";
import { getMyFees } from "./lib/fees.js";
import { launchCoin, getApiStatus } from "./lib/launcher.js";

// API endpoint
const API_BASE_URL = process.env.LAUNCHER_API_URL || 'http://localhost:3001';

// Create server instance
const server = new Server(
  {
    name: "billionaire-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const TOOLS = [
  {
    name: "info",
    description: `Get information about Billionaire - the platform for launching coins on the Ethereum world computer.

Actions:
- platform: Overview of Billionaire, how it works, and why use it
- tokenomics: Token distribution, vesting, and supply details
- fees: Fee structure for launching and trading
- contracts: Smart contract addresses and chain info`,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["platform", "tokenomics", "fees", "contracts"],
          description: "What info to retrieve: platform (overview), tokenomics (token details), fees (fee structure), contracts (addresses)",
        },
      },
      required: [],
    },
  },
  {
    name: "wallet",
    description: `Manage your local Ethereum wallet. This wallet receives your trading fees and signs transactions.

IMPORTANT: Your wallet is encrypted with a password. This is the ONLY way to access your wallet. If you lose your password, your wallet and funds are UNRECOVERABLE.

Actions:
- create: Create a new wallet (requires password you'll remember forever)
- get: Get your wallet address (no password needed)
- balance: Check your ETH balance
- transfer: Send ETH to another address (IRREVERSIBLE - shows warning before sending)
- collect-fees: Claim accumulated trading fees from the contract`,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "get", "balance", "transfer", "collect-fees"],
          description: "Action to perform",
        },
        userId: {
          type: "string",
          description: "Your unique user ID",
        },
        password: {
          type: "string",
          description: "Wallet password (required for: create, transfer, collect-fees)",
        },
        toAddress: {
          type: "string",
          description: "Destination address (required for: transfer)",
        },
        amount: {
          type: "string",
          description: "Amount in ETH (required for: transfer)",
        },
      },
      required: ["action", "userId"],
    },
  },
  {
    name: "launch",
    description: `Deploy a new coin/token on Ethereum mainnet.

What happens:
1. Your coin is deployed with 1 billion total supply
2. You receive 49% (vested over 6 months)
3. 51% goes to the public trading pool
4. You earn 1% of every trade forever

Requirements:
- Must have a wallet (use wallet tool first)
- Password to sign the launch transaction
- Coin name (1-32 characters)
- Trading symbol (2-8 characters, e.g., DOGE, PEPE)

Optional (but encouraged):
- URL: Project website
- GitHub: Source code repository
- Description: What your project does`,
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Your user ID",
        },
        password: {
          type: "string",
          description: "Wallet password to sign the launch",
        },
        name: {
          type: "string",
          description: "Coin name (1-32 characters)",
        },
        symbol: {
          type: "string",
          description: "Trading symbol (2-8 characters)",
        },
        url: {
          type: "string",
          description: "Project website URL (optional but encouraged)",
        },
        github: {
          type: "string",
          description: "GitHub repository URL (optional but encouraged)",
        },
        description: {
          type: "string",
          description: "Brief description of your project (optional but encouraged, max 500 characters)",
        },
      },
      required: ["userId", "password", "name", "symbol"],
    },
  },
  {
    name: "my-fees",
    description: `View your earnings from coin launches and trading.

Actions:
- summary: Total earnings across all your coins
- by-coin: Breakdown of earnings per coin you've launched`,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["summary", "by-coin"],
          description: "View type: summary (totals) or by-coin (per-coin breakdown)",
        },
        userId: {
          type: "string",
          description: "Your user ID",
        },
      },
      required: ["userId"],
    },
  },
  {
    name: "listings",
    description: `Browse coins launched on Billionaire.

Actions:
- all: View all launched coins
- mine: View only your launched coins (requires userId)
- top: View top 10 coins by market cap
- search: Search coins by name or symbol`,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["all", "mine", "top", "search"],
          description: "Browse mode: all, mine (your coins), top (by market cap), search",
        },
        userId: {
          type: "string",
          description: "Your user ID (required for: mine)",
        },
        query: {
          type: "string",
          description: "Search term (required for: search)",
        },
      },
      required: [],
    },
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "info": {
        const { action = "platform" } = args;

        const infoData = {
          platform: {
            name: "Billionaire",
            website: "https://billionaires.com",
            tagline: "Launch your coin on Ethereum. Earn forever.",
            description: "Deploy your project's coin on Ethereum mainnet. Anyone can discover it, trade it, and support your project. You earn 1% of every trade, forever.",
            howItWorks: [
              "1. Create a wallet - this stores your private key locally and receives your trading fees",
              "2. Launch your coin - choose a name and symbol, sign the transaction",
              "3. Deployment - your coin is deployed to Ethereum mainnet with a bonding curve",
              "4. Discovery - the metaverse can find and trade your coin immediately",
              "5. Earn - you receive 1% of every trade, sent directly to your wallet"
            ],
            quickStart: "Use the 'wallet' tool to create a wallet, then 'launch' to deploy your coin."
          },
          tokenomics: {
            totalSupply: "1,000,000,000 (1 billion tokens)",
            distribution: {
              creator: "49% (490,000,000 tokens)",
              publicPool: "51% (510,000,000 tokens)"
            },
            vesting: {
              creatorTokens: "6 months linear vesting",
              releaseSchedule: "Tokens unlock proportionally each block over 6 months",
              claim: "Use wallet collect-fees action to claim vested tokens"
            },
            bondingCurve: {
              phase1: "First 250M tokens at fixed $0.01 per token",
              phase2: "Remaining tokens on bonding curve (price increases with demand)"
            }
          },
          fees: {
            launchFee: "Free (we pay gas)",
            tradingFee: "2% per trade",
            creatorShare: "1% of each trade goes to you (the creator)",
            platformShare: "1% goes to Billionaire platform",
            collection: "Fees accumulate on-chain. Use wallet collect-fees to claim.",
            gasForCollection: "If you have no ETH, we'll pay gas to collect your fees"
          },
          contracts: {
            network: "Ethereum Mainnet",
            chainId: 1,
            factoryAddress: "Deployed after mainnet launch",
            feeHookAddress: "Deployed after mainnet launch",
            uniswapV4Integration: "Coins launch with native Uniswap v4 liquidity",
            verified: "All contracts verified on Etherscan"
          }
        };

        const result = infoData[action] || infoData.platform;
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "wallet": {
        const { action, userId, password } = args;

        switch (action) {
          case "create": {
            if (!password) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: "Password required to create wallet. This password encrypts your wallet where fees will be sent. IMPORTANT: Choose a password you will NEVER forget - there is NO recovery option. If you lose your password, your wallet and funds are gone forever!",
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              };
            }
            const result = await createWallet(userId, password);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }
          case "get": {
            const result = getWalletAddress(userId);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }
          case "balance": {
            const result = await getBalance(userId);
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }
          case "transfer": {
            if (!password) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: "Password required to transfer funds",
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              };
            }
            const { toAddress, amount } = args;
            if (!toAddress || !amount) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: "toAddress and amount are required for transfer",
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              };
            }
            // Return warning first, requiring confirmation
            const transferResult = await transfer(userId, password, toAddress, amount);
            if (transferResult.success) {
              transferResult.warning = "⚠️ This transfer is IRREVERSIBLE. The funds have been sent and cannot be recovered.";
            }
            return {
              content: [
                { type: "text", text: JSON.stringify(transferResult, null, 2) },
              ],
            };
          }
          case "collect-fees": {
            if (!password) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: "Password required to collect fees",
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              };
            }
            const collectResult = await collectFees(userId, password, API_BASE_URL);
            return {
              content: [
                { type: "text", text: JSON.stringify(collectResult, null, 2) },
              ],
            };
          }
          default:
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { error: `Unknown action: ${action}` },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
        }
      }

      case "launch": {
        const { userId, password, name: coinName, symbol, url, github, description } = args;

        if (!password) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    error: "Password required to sign launch request",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const result = await launchCoin({
          userId,
          password,
          name: coinName,
          symbol,
          url,
          github,
          description,
        });

        // Add API status info
        const apiStatus = await getApiStatus();
        result.apiStatus = apiStatus;

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "my-fees": {
        const { action = "summary", userId } = args;
        const feesData = getMyFees(userId);

        if (!feesData.success) {
          return {
            content: [{ type: "text", text: JSON.stringify(feesData, null, 2) }],
            isError: true,
          };
        }

        let result;
        switch (action) {
          case "by-coin":
            result = {
              success: true,
              action: "by-coin",
              description: "Earnings breakdown by coin",
              userId,
              coins: feesData.coins || [],
              totalCoins: feesData.totalCoins || 0
            };
            break;

          case "summary":
          default:
            result = {
              success: true,
              action: "summary",
              description: "Total earnings summary",
              userId,
              totalEarned: feesData.totalEarned || "0",
              totalEarnedFormatted: feesData.totalEarnedFormatted || "0 ETH",
              pendingFees: feesData.pendingFees || "0",
              pendingFeesFormatted: feesData.pendingFeesFormatted || "0 ETH",
              totalCoins: feesData.totalCoins || 0,
              totalTrades: feesData.totalTrades || 0,
              note: "Use action='by-coin' to see per-coin breakdown. Use wallet collect-fees to claim pending fees."
            };
            break;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "listings": {
        const { action = "all", userId, query } = args;

        try {
          const response = await fetch(`${API_BASE_URL}/api/listing`);
          const result = await response.json();

          if (!result.listings) {
            result.listings = [];
          }

          switch (action) {
            case "mine":
              if (!userId) {
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "userId is required for 'mine' action"
                    }, null, 2)
                  }],
                  isError: true,
                };
              }
              result.listings = result.listings.filter(l => l.deployerWallet === userId || l.creator === userId);
              result.action = "mine";
              result.description = "Your launched coins";
              break;

            case "top":
              result.listings = result.listings
                .sort((a, b) => parseFloat(b.marketCap || 0) - parseFloat(a.marketCap || 0))
                .slice(0, 10);
              result.action = "top";
              result.description = "Top 10 coins by market cap";
              break;

            case "search":
              if (!query) {
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "query is required for 'search' action"
                    }, null, 2)
                  }],
                  isError: true,
                };
              }
              const searchLower = query.toLowerCase();
              result.listings = result.listings.filter(l =>
                l.name?.toLowerCase().includes(searchLower) ||
                l.symbol?.toLowerCase().includes(searchLower)
              );
              result.action = "search";
              result.query = query;
              result.description = `Search results for "${query}"`;
              break;

            case "all":
            default:
              result.action = "all";
              result.description = "All launched coins";
              break;
          }

          result.count = result.listings.length;
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Failed to fetch listings: ${err.message}`
              }, null, 2)
            }],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: error.message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Billionaire MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
