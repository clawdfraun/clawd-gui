import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret, getUserByUsername, createUser, getUserById, getUserCount } from './db.js';

export interface AuthPayload {
  userId: number;
  username: string;
  isAdmin: boolean;
  allowedAgents: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Public routes
  if (req.path === '/auth/login' || req.path === '/auth/setup' || req.path === '/auth/status') {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(header.slice(7), getJwtSecret()) as AuthPayload;
    // Refresh user data from DB
    const user = getUserById(decoded.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = {
      userId: user.id,
      username: user.username,
      isAdmin: !!user.is_admin,
      allowedAgents: JSON.parse(user.allowed_agents),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

function generateToken(user: { id: number; username: string; is_admin: number; allowed_agents: string }): string {
  const payload: AuthPayload = {
    userId: user.id,
    username: user.username,
    isAdmin: !!user.is_admin,
    allowedAgents: JSON.parse(user.allowed_agents),
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

const router = Router();

// Check if setup is needed (no users exist)
router.get('/status', (_req: Request, res: Response) => {
  const count = getUserCount();
  res.json({ needsSetup: count === 0 });
});

// Initial setup - create first admin user
router.post('/setup', async (req: Request, res: Response) => {
  const count = getUserCount();
  if (count > 0) {
    res.status(400).json({ error: 'Setup already completed' });
    return;
  }

  const { username, password, displayName } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const user = createUser(username, hash, displayName || null, true, ['*']);
  const token = generateToken(user);

  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.display_name, isAdmin: true, allowedAgents: ['*'] },
  });
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const user = getUserByUsername(username);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      isAdmin: !!user.is_admin,
      allowedAgents: JSON.parse(user.allowed_agents),
    },
  });
});

// Get current user info
router.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const user = getUserById(req.user.userId);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isAdmin: !!user.is_admin,
    allowedAgents: JSON.parse(user.allowed_agents),
  });
});

export const authRouter = router;
