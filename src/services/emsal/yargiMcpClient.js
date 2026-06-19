const axios = require('axios');
const { LRUCache } = require('lru-cache');

const BASE_URL = process.env.YARGI_MCP_URL || 'http://localhost:8000';
const DEFAULT_BLOCKED_HOSTS = [
  'yargimcp.surucu.dev',
  'yargimcp.fastmcp.app',
  'yargi-mcp-pro-production.up.railway.app',
  'yargi.betaspacestudio.com',
];

function envInt(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envBool(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'evet'].includes(String(value).toLocaleLowerCase('tr-TR'));
}

const CONFIG = {
  timeoutMs: envInt('YARGI_MCP_TIMEOUT_MS', 45000),
  retries: envInt('YARGI_MCP_RETRIES', 3),
  cacheMax: envInt('YARGI_MCP_CACHE_MAX', 1000),
  cacheTtlMs: envInt('YARGI_MCP_CACHE_TTL_MS', 1000 * 60 * 60 * 24),
  maxConcurrency: envInt('YARGI_MCP_CONCURRENCY', 8),
  circuitFailures: envInt('YARGI_MCP_CIRCUIT_FAILURES', 5),
  circuitCooldownMs: envInt('YARGI_MCP_CIRCUIT_COOLDOWN_MS', 60 * 1000),
  allowRemote: envBool('YARGI_MCP_ALLOW_REMOTE', false),
  blockedHosts: (process.env.YARGI_MCP_BLOCKED_HOSTS || DEFAULT_BLOCKED_HOSTS.join(','))
    .split(',')
    .map((host) => host.trim().toLocaleLowerCase('en-US'))
    .filter(Boolean),
};

const cache = new LRUCache({
  max: CONFIG.cacheMax,
  ttl: CONFIG.cacheTtlMs,
});

class YargiMcpClient {
  constructor() {
    this.baseUrl = BASE_URL;
    this.runtimeWarning = null;
    this._assertRuntimeAllowed();

    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: CONFIG.timeoutMs,
    });

    this.activeByBucket = new Map();
    this.circuits = new Map();
    this.metrics = {
      calls: 0,
      successes: 0,
      failures: 0,
      cacheHits: 0,
      cacheMisses: 0,
      circuitOpenRejects: 0,
      concurrencyRejects: 0,
      totalLatencyMs: 0,
      byTool: {},
    };
  }

  _assertRuntimeAllowed() {
    let parsed;
    try {
      parsed = new URL(BASE_URL);
    } catch (error) {
      throw new Error(`Invalid YARGI_MCP_URL: ${BASE_URL}`);
    }

    const hostname = parsed.hostname.toLocaleLowerCase('en-US');
    const isBlockedRemote = CONFIG.blockedHosts.includes(hostname);
    if (!CONFIG.allowRemote && isBlockedRemote) {
      throw new Error(
        `Blocked public Yargi MCP runtime "${hostname}". Use LegalZeka self-hosted MCP or set YARGI_MCP_ALLOW_REMOTE=true explicitly.`
      );
    }

    if (CONFIG.allowRemote && isBlockedRemote) {
      this.runtimeWarning = `Remote Yargi MCP runtime explicitly allowed: ${hostname}`;
    }
  }

  _toolMetrics(toolName) {
    if (!this.metrics.byTool[toolName]) {
      this.metrics.byTool[toolName] = {
        calls: 0,
        successes: 0,
        failures: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalLatencyMs: 0,
      };
    }
    return this.metrics.byTool[toolName];
  }

  _getCircuit(toolName) {
    if (!this.circuits.has(toolName)) {
      this.circuits.set(toolName, {
        failures: 0,
        openedAt: null,
        openUntil: null,
        state: 'closed',
      });
    }
    return this.circuits.get(toolName);
  }

  _assertCircuitAllows(toolName) {
    const circuit = this._getCircuit(toolName);
    if (circuit.state !== 'open') return;

    if (circuit.openUntil && Date.now() >= circuit.openUntil) {
      circuit.state = 'half_open';
      return;
    }

    this.metrics.circuitOpenRejects += 1;
    const error = new Error(`Yargi MCP circuit is open for ${toolName}`);
    error.code = 'MCP_CIRCUIT_OPEN';
    throw error;
  }

  _recordCircuitSuccess(toolName) {
    const circuit = this._getCircuit(toolName);
    circuit.failures = 0;
    circuit.openedAt = null;
    circuit.openUntil = null;
    circuit.state = 'closed';
  }

  _recordCircuitFailure(toolName, error) {
    if (error.response && error.response.status >= 400 && error.response.status < 500) return;

    const circuit = this._getCircuit(toolName);
    circuit.failures += 1;
    if (circuit.failures >= CONFIG.circuitFailures) {
      circuit.state = 'open';
      circuit.openedAt = new Date().toISOString();
      circuit.openUntil = Date.now() + CONFIG.circuitCooldownMs;
    }
  }

  async _withConcurrency(bucket, fn) {
    const active = this.activeByBucket.get(bucket) || 0;
    if (active >= CONFIG.maxConcurrency) {
      this.metrics.concurrencyRejects += 1;
      const error = new Error(`Yargi MCP concurrency limit exceeded for ${bucket}`);
      error.code = 'MCP_CONCURRENCY_LIMIT';
      throw error;
    }

    this.activeByBucket.set(bucket, active + 1);
    try {
      return await fn();
    } finally {
      const nextActive = Math.max((this.activeByBucket.get(bucket) || 1) - 1, 0);
      if (nextActive === 0) this.activeByBucket.delete(bucket);
      else this.activeByBucket.set(bucket, nextActive);
    }
  }

  async _requestWithRetry(method, url, data, options = {}) {
    const retries = options.retries ?? CONFIG.retries;
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.client({
          method,
          url,
          data,
          timeout: options.timeout || CONFIG.timeoutMs,
        });
        return response.data;
      } catch (error) {
        lastError = error;
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        if (i < retries - 1) {
          console.warn(`[YargiMcpClient] Request failed, retrying... (${i + 1}/${retries}). Error: ${error.message}`);

          // Exponential backoff: 1s, 2s, 4s
          const waitTime = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    throw lastError;
  }

  _normalizeToolResult(data) {
    let result = data?.result ?? data;
    if (result && Array.isArray(result.content)) {
      const textOutput = result.content
        .filter(item => item.type === 'text' && typeof item.text === 'string')
        .map(item => item.text)
        .join('\n');

      if (textOutput) {
        try {
          result = JSON.parse(textOutput);
        } catch (_) {
          result = textOutput;
        }
      }
    }
    return result;
  }

  async callTool(toolName, args = {}, options = {}) {
    const cacheKey = `${toolName}_${JSON.stringify(args)}`;
    const useCache = options.cache !== false;
    const toolMetrics = this._toolMetrics(toolName);

    if (useCache && cache.has(cacheKey)) {
      console.log(`[YargiMcpClient] Serving ${toolName} from cache`);
      this.metrics.cacheHits += 1;
      toolMetrics.cacheHits += 1;
      return cache.get(cacheKey);
    }

    this.metrics.cacheMisses += 1;
    toolMetrics.cacheMisses += 1;
    this._assertCircuitAllows(toolName);

    const startedAt = Date.now();
    try {
      console.log(`[YargiMcpClient] Calling tool ${toolName}`);
      const result = await this._withConcurrency(toolName, async () => {
        const data = await this._requestWithRetry('POST', `/tools/${toolName}`, args, options);
        return this._normalizeToolResult(data);
      });

      if (useCache) cache.set(cacheKey, result);
      const latency = Date.now() - startedAt;
      this.metrics.calls += 1;
      this.metrics.successes += 1;
      this.metrics.totalLatencyMs += latency;
      toolMetrics.calls += 1;
      toolMetrics.successes += 1;
      toolMetrics.totalLatencyMs += latency;
      this._recordCircuitSuccess(toolName);

      return result;
    } catch (error) {
      const latency = Date.now() - startedAt;
      this.metrics.calls += 1;
      this.metrics.failures += 1;
      this.metrics.totalLatencyMs += latency;
      toolMetrics.calls += 1;
      toolMetrics.failures += 1;
      toolMetrics.totalLatencyMs += latency;
      this._recordCircuitFailure(toolName, error);
      console.error(`[YargiMcpClient] Tool ${toolName} failed:`, error.message);
      const wrapped = new Error(`Yargi-MCP tool call failed: ${error.message}`);
      wrapped.code = error.code || 'YARGI_MCP_TOOL_FAILED';
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return {
        ok: true,
        status: 'healthy',
        baseUrl: this.baseUrl,
        latencyMs: Date.now() - startedAt,
        runtimeWarning: this.runtimeWarning,
        details: response.data,
        metrics: this.getMetricsSnapshot(),
      };
    } catch (error) {
      return {
        ok: false,
        status: 'unhealthy',
        baseUrl: this.baseUrl,
        latencyMs: Date.now() - startedAt,
        runtimeWarning: this.runtimeWarning,
        error: error.message,
        metrics: this.getMetricsSnapshot(),
      };
    }
  }

  getMetricsSnapshot() {
    const avgLatencyMs = this.metrics.calls
      ? Math.round(this.metrics.totalLatencyMs / this.metrics.calls)
      : 0;
    return {
      ...this.metrics,
      avgLatencyMs,
      cacheSize: cache.size,
      activeByBucket: Object.fromEntries(this.activeByBucket.entries()),
      circuits: Object.fromEntries([...this.circuits.entries()].map(([tool, state]) => [
        tool,
        {
          failures: state.failures,
          state: state.state,
          openedAt: state.openedAt,
          openUntil: state.openUntil ? new Date(state.openUntil).toISOString() : null,
        },
      ])),
      config: {
        timeoutMs: CONFIG.timeoutMs,
        retries: CONFIG.retries,
        cacheMax: CONFIG.cacheMax,
        cacheTtlMs: CONFIG.cacheTtlMs,
        maxConcurrency: CONFIG.maxConcurrency,
        circuitFailures: CONFIG.circuitFailures,
        circuitCooldownMs: CONFIG.circuitCooldownMs,
        allowRemote: CONFIG.allowRemote,
      },
    };
  }

  /**
   * Search Yargitay through Bedesten because the official Yargitay MCP
   * tool can be disabled in some deployments while Bedesten remains active.
   */
  async searchYargitay(query, options = {}) {
    return this.callTool('search_bedesten_unified', {
      phrase: query,
      court_types: ['YARGITAYKARARI'],
      ...options
    });
  }

  async searchBedesten(query, options = {}) {
    return this.callTool('search_bedesten_unified', {
      phrase: query,
      court_types: ['YARGITAYKARARI', 'DANISTAYKARAR', 'YERELHUKUK', 'ISTINAFHUKUK', 'KYB'],
      pageNumber: 1,
      ...options
    });
  }

  async searchEmsal(query, options = {}) {
    return this.callTool('search_emsal_detailed_decisions', {
      keyword: query,
      page_number: 1,
      ...options
    });
  }
}

module.exports = new YargiMcpClient();
