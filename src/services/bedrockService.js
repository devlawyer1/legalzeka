// ============================================================
// Emsal Atlası - AWS Bedrock Service
// Model: Claude 3.5 Haiku (Cross-Region)
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime');

// Import the MCP Agent Service
const mcpAgentService = require('./mcpAgentService');

// ── AWS İstemcisi ────────────────────────────────────────────
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

const BEDROCK_SYSTEM_PROMPT =
  'Sen Legal Zeka platformunun yapay zeka asistanısın. Avukatların sorularını profesyonelce yanıtlarsın. Seni "LegalZeka" ekibi geliştirdi. Sana "Seni kim geliştirdi?", "Kimin eserisin?" gibi sorular sorulduğunda Google, Anthropic vb. şirketlerin ismini KESİNLİKLE anma, sadece "LegalZeka ekibi tarafından geliştirildim" de.\n\nEğer bir emsal karar veya yargı kararı aranıyorsa mutlaka sana sunulan araçları (tools) kullan.';

/**
 * AWS Bedrock üzerinden Claude 4.5 Haiku'ya mesaj gönderir ve Tool çağrılarını (MCP) otomatik yönetir.
 */
async function invokeBedrockClaude(userMessage, options = {}) {
  const {
    systemPrompt = BEDROCK_SYSTEM_PROMPT,
    maxTokens = 4096,
    temperature = 0.7,
    conversationHistory = [],
    toolsEnabled = true,
    model: requestedModel = null,
  } = options;

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS kimlik bilgileri eksik!');
  }

  // Ensure MCP is connected
  if (toolsEnabled) {
    try {
      await mcpAgentService.connect();
    } catch (err) {
      console.warn("MCP Server connection failed, proceeding without tools.", err.message);
    }
  }

  // Build the conversation history
  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant', // Map role correctly
      content: [{ text: msg.content }],
    })),
    {
      role: 'user',
      content: [{ text: userMessage }],
    },
  ];

  let stopReason = '';
  let finalResponse = '';

  // Max 5 tool call iterations
  let iteration = 0;
  const MAX_ITERATIONS = 5;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    
    // Construct the payload for ConverseCommand
    const commandPayload = {
      modelId: requestedModel || process.env.BEDROCK_MODEL || MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: messages,
      inferenceConfig: {
        maxTokens,
        temperature,
        topP: 0.9,
      }
    };

    // Attach tools if MCP is connected
    const bedrockToolConfig = toolsEnabled ? mcpAgentService.getBedrockToolConfig() : { tools: [] };
    if (toolsEnabled && mcpAgentService.isConnected && bedrockToolConfig.tools.length > 0) {
      commandPayload.toolConfig = bedrockToolConfig;
    }

    try {
      console.log(`[Bedrock] Sending message to Claude (Iteration ${iteration})...`);
      const command = new ConverseCommand(commandPayload);
      const response = await bedrockClient.send(command);

      const assistantMessage = response.output.message;
      messages.push(assistantMessage); // Append assistant's response to history
      stopReason = response.stopReason;

      // Extract text content if any
      const textBlock = assistantMessage.content.find(c => c.text);
      if (textBlock) {
        finalResponse += textBlock.text;
      }

      // Check if the model wants to use a tool
      if (stopReason === 'tool_use') {
        const toolUseBlocks = assistantMessage.content.filter(c => c.toolUse);
        
        // Prepare the user message with tool results
        const toolResults = [];

        for (const block of toolUseBlocks) {
          const toolUse = block.toolUse;
          console.log(`[Bedrock] Model requested tool: ${toolUse.name}`);
          
          try {
            // Execute the tool via MCP
            const toolOutput = await mcpAgentService.executeTool(toolUse.name, toolUse.input);
            
            toolResults.push({
              toolResult: {
                toolUseId: toolUse.toolUseId,
                content: [{ text: toolOutput }],
                status: 'success'
              }
            });
          } catch (toolError) {
            console.error(`[Bedrock] Tool execution error for ${toolUse.name}:`, toolError);
            toolResults.push({
              toolResult: {
                toolUseId: toolUse.toolUseId,
                content: [{ text: `Error executing tool: ${toolError.message}` }],
                status: 'error'
              }
            });
          }
        }

        // Add the tool results back to the messages to continue the conversation
        messages.push({
          role: 'user',
          content: toolResults
        });
        
        // Loop will continue and send the tool results back to Claude
      } else {
        // Model is done
        break;
      }

    } catch (error) {
      console.error('🔴 Bedrock RAW Error:', {
        name: error.name,
        message: error.message,
      });
      throw new Error(`AWS Bedrock hatası: ${error.message}`);
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    console.warn("[Bedrock] Reached maximum tool call iterations.");
  }

  return finalResponse || 'Yanıt üretilemedi.';
}

module.exports = {
  invokeBedrockClaude,
  BEDROCK_SYSTEM_PROMPT,
  MODEL_ID,
};
