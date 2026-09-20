// server/paths.js — filesystem anchors only. Kept free of process.env reads so it
// can be imported *before* dotenv loads the .env files (see server/index.js).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(SERVER_DIR, '..');
export const DIST_DIR = path.join(APP_ROOT, 'dist');
export const DEFAULT_DATA_DIR = path.join(APP_ROOT, '.data');
