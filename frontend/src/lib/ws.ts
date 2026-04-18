import { io, Socket } from 'socket.io-client';
import { authFetch } from './api';

let socket: Socket | null = null;

export async function connectWebsocket() {
  if (socket) return socket;

  try {
    const res = await authFetch('/ws-ticket', { credentials: 'include' });
    const { ticket } = await res.json();

    socket = io(location.origin, {
      auth: { ticket }
    });

    socket.on('connect', () => {
      console.log('Successfully connected to real-time events.');
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });

    return socket;
  } catch (e) {
    console.error('Failed to establish websocket', e);
    return null;
  }
}
