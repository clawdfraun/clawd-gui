import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getAllUsers, createUser, updateUser, deleteUser, getUserById } from '../db';
import { requireAdmin } from '../auth';

const router = Router();

// All user management routes require admin
router.use(requireAdmin);

// List all users
router.get('/', (_req: Request, res: Response) => {
  const users = getAllUsers().map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    allowedAgents: JSON.parse(u.allowed_agents),
    isAdmin: !!u.is_admin,
    createdAt: u.created_at,
  }));
  res.json({ users });
});

// Create user
router.post('/', async (req: Request, res: Response) => {
  const { username, password, displayName, isAdmin, allowedAgents } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const user = createUser(username, hash, displayName || null, !!isAdmin, allowedAgents || ['*']);
    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      allowedAgents: JSON.parse(user.allowed_agents),
      isAdmin: !!user.is_admin,
      createdAt: user.created_at,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// Update user
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const user = getUserById(id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updates: Parameters<typeof updateUser>[1] = {};
  if (req.body.displayName !== undefined) updates.display_name = req.body.displayName;
  if (req.body.allowedAgents !== undefined) updates.allowed_agents = req.body.allowedAgents;
  if (req.body.isAdmin !== undefined) updates.is_admin = req.body.isAdmin;
  if (req.body.password) updates.password_hash = await bcrypt.hash(req.body.password, 12);

  updateUser(id, updates);
  const updated = getUserById(id)!;
  res.json({
    id: updated.id,
    username: updated.username,
    displayName: updated.display_name,
    allowedAgents: JSON.parse(updated.allowed_agents),
    isAdmin: !!updated.is_admin,
    createdAt: updated.created_at,
  });
});

// Delete user
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (req.user?.userId === id) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }
  deleteUser(id);
  res.json({ ok: true });
});

export const usersRouter = router;
