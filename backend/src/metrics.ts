import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const ingressRequestsTotal = new client.Counter({
  name: 'hooksink_ingress_requests_total',
  help: 'Total number of ingress requests received',
  labelNames: ['method', 'status'],
  registers: [register],
});

export const requestDropTotal = new client.Counter({
  name: 'hooksink_dropped_requests_total',
  help: 'Total number of request logs dropped due to load shedding',
  registers: [register],
});

export const vmExecutionDuration = new client.Histogram({
  name: 'hooksink_vm_execution_duration_seconds',
  help: 'Duration of JS sandbox executions in seconds',
  registers: [register],
});
