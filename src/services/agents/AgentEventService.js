const { AgentScheduleService } = require('./AgentScheduleService');

async function emitAgentEvent(event, { scheduleService = null } = {}) {
  try {
    const service = scheduleService || new AgentScheduleService();
    return await service.triggerEvent(event);
  } catch (error) {
    console.error('[AgentEvent] trigger skipped:', error.code || error.message);
    return [];
  }
}

module.exports = { emitAgentEvent };
