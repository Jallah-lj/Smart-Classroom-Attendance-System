import crypto from 'node:crypto';
import QRCode from 'qrcode';

export interface QrTokenPayload {
  sessionId: string;
  windowIndex: number;
  expiresInSeconds: number;
  token: string;
}

export function getCurrentWindowIndex(timestampMs: number = Date.now(), intervalSeconds: number = 15): number {
  return Math.floor(timestampMs / 1000 / intervalSeconds);
}

export function generateTokenForWindow(sessionId: string, qrSecret: string, windowIndex: number): string {
  const hmac = crypto.createHmac('sha256', qrSecret);
  hmac.update(`${sessionId}:${windowIndex}`);
  return hmac.digest('hex').substring(0, 32);
}

export function generateSessionQrToken(
  sessionId: string,
  qrSecret: string,
  intervalSeconds: number = 15,
  timestampMs: number = Date.now()
): QrTokenPayload {
  const windowIndex = getCurrentWindowIndex(timestampMs, intervalSeconds);
  const token = generateTokenForWindow(sessionId, qrSecret, windowIndex);
  
  const currentSecond = Math.floor(timestampMs / 1000);
  const nextWindowSecond = (windowIndex + 1) * intervalSeconds;
  const expiresInSeconds = Math.max(1, nextWindowSecond - currentSecond);

  return {
    sessionId,
    windowIndex,
    expiresInSeconds,
    token
  };
}

export function verifySessionQrToken(
  sessionId: string,
  qrSecret: string,
  providedToken: string,
  intervalSeconds: number = 15,
  toleranceWindows: number = 2,
  timestampMs: number = Date.now()
): boolean {
  if (!providedToken || typeof providedToken !== 'string') {
    return false;
  }

  const currentWindow = getCurrentWindowIndex(timestampMs, intervalSeconds);
  const provBuf = Buffer.from(providedToken);

  // Check current window and previous tolerance windows
  for (let offset = 0; offset <= toleranceWindows; offset++) {
    const candidateWindow = currentWindow - offset;
    const expectedToken = generateTokenForWindow(sessionId, qrSecret, candidateWindow);
    const expBuf = Buffer.from(expectedToken);
    
    if (provBuf.length === expBuf.length && crypto.timingSafeEqual(provBuf, expBuf)) {
      return true;
    }
  }

  return false;
}

export async function generateQrDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 10,
    color: {
      dark: '#09090B',
      light: '#FFFFFF'
    }
  });
}
