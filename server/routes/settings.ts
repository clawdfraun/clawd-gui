import { Router, Request, Response } from 'express';
import { getSetting, setSetting } from '../db';
import { requireAdmin } from '../auth';

const router = Router();

// Get gateway settings (any authenticated user)
router.get('/gateway', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({
    gatewayUrl: getSetting('gateway_url') || '',
    gatewayToken: getSetting('gateway_token') || '',
  });
});

// Update gateway settings (admin only)
router.put('/gateway', requireAdmin, (req: Request, res: Response) => {
  const { gatewayUrl, gatewayToken } = req.body;
  if (gatewayUrl !== undefined) setSetting('gateway_url', gatewayUrl);
  if (gatewayToken !== undefined) setSetting('gateway_token', gatewayToken);
  res.json({ ok: true });
});

export const settingsRouter = router;
