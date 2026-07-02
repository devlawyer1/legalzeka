const express = require('express');
const { HealthService } = require('../services/operations/HealthService');
const { renderMetrics } = require('../services/observability');

const router = express.Router(); const health = new HealthService();
router.get('/live', (req, res) => res.json(health.live()));
router.get('/ready', async (req, res, next) => { try { const result = await health.ready(); res.status(result.status === 'UP' ? 200 : 503).json(result); } catch (error) { next(error); } });
router.get('/dependencies', async (req, res, next) => { try { res.json({ status: 'OK', dependencies: await health.dependencies() }); } catch (error) { next(error); } });
router.get('/metrics', (req, res) => { res.type('text/plain; version=0.0.4').send(renderMetrics()); });
module.exports = router;
