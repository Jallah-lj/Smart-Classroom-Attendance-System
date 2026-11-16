import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/audit.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Valid email and password required.' });
    return;
  }

  const { email, password } = parseResult.data;
  const userRes = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (userRes.rows.length === 0) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    return;
  }

  const user = userRes.rows[0];
  if (!user.is_active) {
    res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Account is inactive or suspended.' });
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    return;
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      matricOrStaffNo: user.matric_or_staff_no
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'USER_LOGIN',
    targetEntity: 'users',
    targetId: user.id,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      matricOrStaffNo: user.matric_or_staff_no
    }
  });
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.json({ user: req.user });
});
