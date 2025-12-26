import { startRPCServer } from '../dist/es/index.mjs';

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, './.env') });

startRPCServer(
  process.env.MIDSCENE_RPC_PORT
    ? Number(process.env.MIDSCENE_RPC_PORT)
    : undefined,
);
