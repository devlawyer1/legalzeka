// Polyfill EventSource for Node.js
global.EventSource = require('eventsource');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

const BLOCKED_REMOTE_HOSTS = (process.env.YARGI_MCP_BLOCKED_HOSTS
  || 'yargimcp.surucu.dev,yargimcp.fastmcp.app,yargi-mcp-pro-production.up.railway.app,yargi.betaspacestudio.com')
  .split(',')
  .map((host) => host.trim().toLocaleLowerCase('en-US'))
  .filter(Boolean);

function allowRemoteMcp() {
  return ['true', '1', 'yes', 'evet'].includes(String(process.env.YARGI_MCP_ALLOW_REMOTE || '').toLocaleLowerCase('tr-TR'));
}

function buildYargiMcpSseUrl() {
  const baseUrl = process.env.YARGI_MCP_URL || 'http://localhost:8000';
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/mcp/`);
  if (!allowRemoteMcp() && BLOCKED_REMOTE_HOSTS.includes(url.hostname.toLocaleLowerCase('en-US'))) {
    throw new Error(`Blocked public Yargi MCP runtime "${url.hostname}". Use LegalZeka self-hosted MCP.`);
  }
  return url;
}

class McpAgentService {
  constructor() {
    this.client = null;
    this.transport = null;
    this.tools = [];
    this.bedrockTools = [];
    this.isConnected = false;
    this.connectionPromise = null;
  }

  async connect() {
    if (this.isConnected) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = (async () => {
      try {
        const yargiMcpSseUrl = buildYargiMcpSseUrl();
        console.log(`[McpAgent] Connecting to ${yargiMcpSseUrl}...`);

        this.transport = new SSEClientTransport(yargiMcpSseUrl);
        this.client = new Client({
          name: "LegalZeka-Node-Client",
          version: "1.0.0"
        }, {
          capabilities: {}
        });

        await this.client.connect(this.transport);
        this.isConnected = true;
        console.log('[McpAgent] Connected successfully.');

        // Fetch tools immediately
        await this.refreshTools();
      } catch (error) {
        console.error('[McpAgent] Connection failed:', error);
        this.isConnected = false;
        throw error;
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  async refreshTools() {
    if (!this.isConnected) await this.connect();

    console.log('[McpAgent] Fetching tools from MCP server...');
    const response = await this.client.listTools();
    this.tools = response.tools;
    
    // Map to AWS Bedrock Converse API Tool Schema
    this.bedrockTools = this.tools.map(tool => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: tool.inputSchema
        }
      }
    }));

    // Map to Google Gemini API Tool Schema
    this.geminiTools = [{
      functionDeclarations: this.tools.map(tool => {
        const parameters = JSON.parse(JSON.stringify(tool.inputSchema));
        
        const removeAdditionalProperties = (obj) => {
          if (obj && typeof obj === 'object') {
            if ('additionalProperties' in obj) delete obj.additionalProperties;
            Object.values(obj).forEach(removeAdditionalProperties);
          }
        };
        removeAdditionalProperties(parameters);

        // Gemini strict schema check: replace type string with uppercase for Gemini Type enum
        // The generative-ai SDK accepts standard JSON schema if structured carefully
        if (parameters.type && typeof parameters.type === 'string') {
          parameters.type = parameters.type.toUpperCase();
        }
        if (parameters.properties) {
          for (const key in parameters.properties) {
            if (parameters.properties[key].type && typeof parameters.properties[key].type === 'string') {
              parameters.properties[key].type = parameters.properties[key].type.toUpperCase();
            }
          }
        }
        return {
          name: tool.name,
          description: tool.description,
          parameters: parameters
        };
      })
    }];
    
    console.log(`[McpAgent] Loaded ${this.tools.length} tools for Bedrock & Gemini.`);
  }

  getBedrockToolConfig() {
    return {
      tools: this.bedrockTools
    };
  }

  getGeminiToolConfig() {
    return this.geminiTools;
  }

  /**
   * Execute a tool called by the LLM
   */
  async executeTool(toolName, args) {
    if (!this.isConnected) await this.connect();
    
    console.log(`[McpAgent] Executing tool ${toolName} with args:`, JSON.stringify(args).substring(0, 200));
    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });
      
      // Extract text content from MCP result
      let textOutput = '';
      if (result && result.content) {
        textOutput = result.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
      }
      return textOutput || JSON.stringify(result);
    } catch (error) {
      console.error(`[McpAgent] Tool ${toolName} execution failed:`, error);
      return `Hata oluştu: ${error.message}`;
    }
  }
}

const mcpAgentInstance = new McpAgentService();
module.exports = mcpAgentInstance;
