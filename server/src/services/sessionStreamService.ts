import { Response } from 'express';
import { generateSessionQrToken, generateQrDataUrl } from '../lib/qr.js';

interface SessionListener {
  id: string;
  res: Response;
  sessionId: string;
}

const listeners = new Map<string, Set<SessionListener>>();

export function addSessionListener(sessionId: string, res: Response): string {
  const listenerId = Math.random().toString(36).substring(2, 9);
  if (!listeners.has(sessionId)) {
    listeners.set(sessionId, new Set());
  }
  const listener: SessionListener = { id: listenerId, res, sessionId };
  listeners.get(sessionId)!.add(listener);

  // Remove on client disconnect
  res.on('close', () => {
    removeSessionListener(sessionId, listenerId);
  });

  return listenerId;
}

export function removeSessionListener(sessionId: string, listenerId: string): void {
  const set = listeners.get(sessionId);
  if (set) {
    for (const item of set) {
      if (item.id === listenerId) {
        set.delete(item);
        break;
      }
    }
    if (set.size === 0) {
      listeners.delete(sessionId);
    }
  }
}

export function broadcastSessionEvent(sessionId: string, eventName: string, data: any): void {
  const set = listeners.get(sessionId);
  if (!set || set.size === 0) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const listener of set) {
    try {
      listener.res.write(payload);
    } catch (err) {
      // Client disconnected
    }
  }
}

export async function sendQrUpdate(session: any): Promise<void> {
  const qrData = generateSessionQrToken(session.id, session.qr_secret, session.qr_interval_seconds);
  const qrPayloadString = JSON.stringify({
    sid: session.id,
    tok: qrData.token,
    exp: qrData.expiresInSeconds,
    win: qrData.windowIndex
  });

  const qrDataUrl = await generateQrDataUrl(qrPayloadString);

  broadcastSessionEvent(session.id, 'qr-token', {
    sessionId: session.id,
    qrToken: qrData.token,
    expiresInSeconds: qrData.expiresInSeconds,
    intervalSeconds: session.qr_interval_seconds,
    roomCode: session.room_code,
    qrDataUrl
  });
}
