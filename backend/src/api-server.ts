import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { prisma } from './db';
import { auth, requiresAuth } from 'express-openid-connect';
import crypto from 'crypto';

export const controlApp = express();
export const httpServer = createServer(controlApp);
export const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

controlApp.use(cors());
controlApp.use(express.json({ limit: process.env.MAX_BODY_SIZE || '5mb' }));

import path from 'path';

// OIDC Authentication Middleware using Authorization Code Flow
// Setting authRequired to true natively protects the entire express server
controlApp.use(auth({
  authRequired: true,
  auth0Logout: false,
  secret: process.env.OIDC_SESSION_SECRET || 'fallback-random-secret-for-development-only',
  baseURL: process.env.OIDC_BASE_URL || 'http://localhost:3000',
  clientID: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  issuerBaseURL: process.env.OIDC_ISSUER,
  authorizationParams: {
    response_type: 'code',
    scope: 'openid profile email'
  },
  routes: {
    callback: '/oauth/callback'
  }
}));

// Control API Routes
controlApp.get('/api/v1/routes', async (req, res) => {
  const routes = await prisma.dynamicRoute.findMany();
  res.json(routes.map(r => ({
    ...r,
    fileData: r.fileData ? Buffer.from(r.fileData).toString('base64') : null
  })));
});

controlApp.post('/api/v1/routes', async (req, res) => {
  const { path, isRegex, handlerType, content, fileData, responseHeaders } = req.body;
  const newRoute = await prisma.dynamicRoute.create({
    data: { 
      path, 
      isRegex: !!isRegex,
      handlerType, 
      content: content || '',
      fileData: fileData ? Buffer.from(fileData, 'base64') : null,
      responseHeaders: responseHeaders || null
    },
  });
  res.status(201).json({
    ...newRoute,
    fileData: newRoute.fileData ? Buffer.from(newRoute.fileData).toString('base64') : null
  });
});

controlApp.put('/api/v1/routes/:id', async (req, res) => {
  const { path, isRegex, handlerType, content, fileData, responseHeaders } = req.body;
  
  const updateData: any = { path, isRegex: !!isRegex, handlerType, content: content || '' };
  if (responseHeaders !== undefined) updateData.responseHeaders = responseHeaders;
  if (fileData !== undefined) updateData.fileData = fileData === null ? null : Buffer.from(fileData, 'base64');

  const updated = await prisma.dynamicRoute.update({
    where: { id: req.params.id },
    data: updateData,
  });
  res.json({
    ...updated,
    fileData: updated.fileData ? Buffer.from(updated.fileData).toString('base64') : null
  });
});

controlApp.get('/api/v1/logs', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 50));
  const q = (req.query.q as string) || '';

  const whereClause = q ? {
    path: { contains: q, mode: 'insensitive' as const }
  } : {};

  const [total, logs] = await Promise.all([
    prisma.requestLog.count({ where: whereClause }),
    prisma.requestLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        method: true,
        path: true,
        headers: true,
        bodyType: true,
        body: true,
        createdAt: true,
      }
    })
  ]);

  // Send still-compressed bodies natively encoded as base64
  // The client/frontend will decompress them to save network bandwidth
  const compressedLogs = logs.map(log => {
    return {
      ...log,
      body: log.body ? Buffer.from(log.body).toString('base64') : null
    };
  });

  res.json({
    data: compressedLogs,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  });
});

controlApp.delete('/api/v1/logs', async (req, res) => {
  await prisma.requestLog.deleteMany();
  res.json({ success: true });
});

// WebSocket Authentication Ticket mechanism
const wsTickets: Set<string> = new Set();

controlApp.get('/api/v1/ws-ticket', (req, res) => {
  const ticket = crypto.randomBytes(64).toString('hex');
  wsTickets.add(ticket);
  // Expire ticket in 30 seconds
  setTimeout(() => wsTickets.delete(ticket), 30000);
  res.json({ ticket });
});

io.use((socket, next) => {
  const ticket = socket.handshake.auth.ticket;
  if (!ticket || !wsTickets.has(ticket)) {
    return next(new Error('Authentication error'));
  }
  // Consume ticket
  wsTickets.delete(ticket);
  next();
});

io.on('connection', (socket) => {
  console.log('Authenticated frontend connected to WebSockets');
});

// Mount the frontend compilation directory so it's served by this Express backend.
// Because authRequired is true, serving this dist folder is completely locked behind OIDC natively!
const frontendDistPaths = path.join(__dirname, '../../frontend/dist');
controlApp.use(express.static(frontendDistPaths));

// Fallback to Svelte UI for any stray SPA URLs (Express 5 compatible)
controlApp.use((req, res) => {
  res.sendFile(path.join(frontendDistPaths, 'index.html'));
});
