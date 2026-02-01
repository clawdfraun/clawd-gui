import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'clawd-gui.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    allowed_agents TEXT NOT NULL DEFAULT '["*"]',
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Generate JWT secret if not set
function getOrCreateSetting(key: string, defaultValue: () => string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (row) return row.value;
  const val = defaultValue();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, val);
  return val;
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || getOrCreateSetting('jwt_secret', () => crypto.randomBytes(64).toString('hex'));
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getUserCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return row.count;
}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  allowed_agents: string;
  is_admin: number;
  created_at: string;
}

export function getUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function createUser(username: string, passwordHash: string, displayName: string | null, isAdmin: boolean, allowedAgents: string[] = ['*']): UserRow {
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, is_admin, allowed_agents) VALUES (?, ?, ?, ?, ?)'
  ).run(username, passwordHash, displayName, isAdmin ? 1 : 0, JSON.stringify(allowedAgents));
  return getUserById(result.lastInsertRowid as number)!;
}

export function getAllUsers(): UserRow[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[];
}

export function updateUser(id: number, updates: { display_name?: string | null; allowed_agents?: string[]; is_admin?: boolean; password_hash?: string }): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (updates.display_name !== undefined) { sets.push('display_name = ?'); vals.push(updates.display_name); }
  if (updates.allowed_agents !== undefined) { sets.push('allowed_agents = ?'); vals.push(JSON.stringify(updates.allowed_agents)); }
  if (updates.is_admin !== undefined) { sets.push('is_admin = ?'); vals.push(updates.is_admin ? 1 : 0); }
  if (updates.password_hash !== undefined) { sets.push('password_hash = ?'); vals.push(updates.password_hash); }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteUser(id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export default db;
