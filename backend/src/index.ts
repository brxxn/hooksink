import express from 'express';
import { httpServer as controlServer } from './api-server';
import { ingressApp } from './ingress-svr';
import { register } from './metrics';

const API_PORT = process.env.API_PORT || 3000;
const INGRESS_PORT = process.env.INGRESS_PORT || 3001;
const METRICS_PORT = process.env.METRICS_PORT || 3002;

// Boot the control panel API & websocket server
controlServer.listen(API_PORT, () => {
  console.log(`[Control API] listening on port ${API_PORT}`);
});

// Boot the wildcard ingress server
ingressApp.listen(INGRESS_PORT, () => {
  console.log(`[Ingress HTTP] listening on port ${INGRESS_PORT}`);
});

// Boot the isolated Metrics server
const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

metricsApp.listen(METRICS_PORT, () => {
  console.log(`[Metrics] listening on port ${METRICS_PORT}`);
});
