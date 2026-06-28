// ============================================================
// Emsal Atlası - Google Gemini Service
// Model: Gemini 1.5 Flash / Pro
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { GoogleGenerativeAI } = require('@google/generative-ai');
const mcpAgentService = require('./mcpAgentService');

const GEMINI_SYSTEM_PROMPT =
  'Sen Legal Zeka platformunun yapay zeka asistanısın. Avukatların sorularını profesyonelce yanıtlarsın. Seni "LegalZeka" ekibi geliştirdi. Sana "Seni kim geliştirdi?", "Kimin eserisin?" gibi sorular sorulduğunda Google, Anthropic vb. şirketlerin ismini KESİNLİKLE anma, sadece "LegalZeka ekibi tarafından geliştirildim" de.\n\nEğer bir emsal karar veya yargı kararı aranıyorsa mutlaka sana sunulan araçları (tools) kullan.';

async function invokeGemini(userMessage, options = {}) {
  const {
    systemPrompt = GEMINI_SYSTEM_PROMPT,
    maxTokens = 4096,
    temperature = 0.7,
    conversationHistory = [],
    toolsEnabled = true,
  } = options;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY eksik!');
  }

  // Ensure MCP is connected
  if (toolsEnabled) {
    try {
      await mcpAgentService.connect();
    } catch (err) {
      console.warn("MCP Server connection failed, proceeding without tools.", err.message);
    }
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  
  // Prepare tools
  let tools = [];
  const geminiToolConfig = toolsEnabled ? mcpAgentService.getGeminiToolConfig() : [];
  if (toolsEnabled && mcpAgentService.isConnected && geminiToolConfig && geminiToolConfig.length > 0) {
    tools = geminiToolConfig;
  }

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    tools: tools.length > 0 ? tools : undefined
  });

  // Prepare History (Google Gemini uses 'user' and 'model')
  const history = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const chat = model.startChat({
    history: history,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: temperature,
    }
  });

  let finalResponse = '';
  let iteration = 0;
  const MAX_ITERATIONS = 5;

  let currentMessage = userMessage;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[Gemini] Sending message (Iteration ${iteration})...`);
    
    try {
      // If we are sending tool results, we need to format them correctly as parts.
      // However, startChat's sendMessage handles plain text best, or complex parts.
      let result;
      if (typeof currentMessage === 'string') {
        result = await chat.sendMessage(currentMessage);
      } else {
        result = await chat.sendMessage(currentMessage); // Send an array of parts
      }

      const response = result.response;
      
      const text = response.text();
      if (text) finalResponse += text;

      const functionCalls = response.functionCalls();
      
      if (functionCalls && functionCalls.length > 0) {
        const functionResponses = [];
        
        for (const call of functionCalls) {
          console.log(`[Gemini] Model requested tool: ${call.name}`);
          
          try {
             // Execute tool
             const toolOutput = await mcpAgentService.executeTool(call.name, call.args);
             
             functionResponses.push({
               functionResponse: {
                 name: call.name,
                 response: {
                   result: toolOutput
                 }
               }
             });
          } catch (toolError) {
             console.error(`[Gemini] Tool execution error for ${call.name}:`, toolError);
             functionResponses.push({
               functionResponse: {
                 name: call.name,
                 response: {
                   error: toolError.message
                 }
               }
             });
          }
        }
        
        // Next iteration sends the function responses back
        currentMessage = functionResponses;
      } else {
        // No function call, we are done
        break;
      }

    } catch (error) {
      console.error('🔴 Gemini RAW Error:', error);
      throw new Error(`Google Gemini hatası: ${error.message}`);
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    console.warn("[Gemini] Reached maximum tool call iterations.");
  }

  return finalResponse || 'Yanıt üretilemedi.';
}

module.exports = {
  invokeGemini,
  GEMINI_SYSTEM_PROMPT
};
