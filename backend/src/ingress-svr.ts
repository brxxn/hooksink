import express from 'express';
import { prisma } from './db';
import { executeDynamicRoute } from './sandbox';
import { io } from './api-server';
import { ingressRequestsTotal, requestDropTotal } from './metrics';
import zlib from 'zlib';

export const ingressApp = express();

const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || '5mb';

// We grab raw bodies to support dropping binary directly into postgres BYTEA
ingressApp.use(express.raw({ type: '*/*', limit: MAX_BODY_SIZE }));

// Rate limiting state for shedding DB load
let logsWrittenLastMinute = 0;
const MAX_WRITES_PER_MIN = 60;
setInterval(() => { logsWrittenLastMinute = 0; }, 1000);

ingressApp.all(/(.*)/, async (req, res) => {
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.alloc(0);
  const routePath = req.path;

  // 1. Check for dynamic route first
  const routes = await prisma.dynamicRoute.findMany();
  let dynamicRoute = null;
  for (const r of routes) {
    try {
      if (r.isRegex) {
        if (new RegExp(r.path).test(routePath)) { dynamicRoute = r; break; }
      } else {
        if (r.path === routePath) { dynamicRoute = r; break; }
      }
    } catch (e) { /* Ignore invalid regex */ }
  }

  let responseConfig = { status: 200, headers: {} as Record<string, string>, body: 'hi there!' as string | Buffer };

  if (dynamicRoute) {
    if (dynamicRoute.handlerType === 'STATIC') {
      responseConfig.body = dynamicRoute.fileData ? Buffer.from(dynamicRoute.fileData) : dynamicRoute.content;
      responseConfig.headers = (dynamicRoute.responseHeaders as Record<string, string>) || { 'Content-Type': 'text/plain' };
    } else if (dynamicRoute.handlerType === 'JAVASCRIPT') {
      const result = await executeDynamicRoute(dynamicRoute.content, {
        method: req.method,
        path: req.path,
        headers: req.headers,
        query: req.query,
        body: rawBody.toString('utf8'), // convert to string for JS sandbox to read
      });
      responseConfig = result;
    }
  }

  // 2. Load shedding - write to DB if we're under limit
  let logId = 'dropped_due_to_load';

  // Decide body type
  const isBinary = !req.is('application/json') && !req.is('text/*') && rawBody.length > 0;
  const bodyType = isBinary ? 'BINARY' : (req.is('application/json') ? 'JSON' : 'TEXT');

  const compressedBody = rawBody.length > 0 ? zlib.deflateSync(rawBody) : null;

  if (logsWrittenLastMinute < MAX_WRITES_PER_MIN) {
    try {
      logsWrittenLastMinute++;
      const savedLog = await prisma.requestLog.create({
        data: {
          method: req.method,
          path: req.originalUrl,
          headers: req.headers,
          query: req.query,
          bodyType,
          body: compressedBody,
        }
      });
      logId = savedLog.id;
    } catch (e) {
      console.error('Failed to write log', e);
      requestDropTotal.inc();
    }
  } else {
    requestDropTotal.inc();
  }

  // 3. Emit via socket (so UI feels real-time even if DB drops it)
  io.emit('new_request', {
    id: logId,
    method: req.method,
    path: req.originalUrl,
    headers: req.headers,
    bodyType,
    body: compressedBody ? compressedBody.toString('base64') : null,
    timestamp: new Date().toISOString()
  });

  ingressRequestsTotal.inc({ method: req.method, status: responseConfig.status.toString(), path: req.path });

  // 4. Send response
  res.status(responseConfig.status)
    .set(responseConfig.headers)
    .send(responseConfig.body);
});
