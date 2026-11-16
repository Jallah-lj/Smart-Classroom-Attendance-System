import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'apex-attendance-secure-jwt-key-2026-very-long-secret',
  jwtExpiresIn: '12h',
  qrRotationIntervalSeconds: 15,
  qrWindowToleranceCount: 2, // Allow previous and current window for network lag
  nodeEnv: process.env.NODE_ENV || 'development',
  institution: {
    name: 'Apex Institute of Science & Technology',
    code: 'APEX-UNI',
    timezone: 'Africa/Kigali',
    disclaimer: 'Notice: Browsers and web APIs cannot prove physical presence. Geolocation, QR scanning, and live camera verification provide corroborating evidence only.'
  }
};
