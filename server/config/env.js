import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine which .env file to load based on NODE_ENV argument or environment variable
const environment = process.env.NODE_ENV || 'local';
const envFile = `.env.${environment}`;
const envPath = resolve(__dirname, '../../', envFile);

// Load the environment-specific .env file
const result = config({ path: envPath });

if (result.error) {
  console.warn(`Warning: Could not load ${envFile}, trying .env fallback`);
  config({ path: resolve(__dirname, '../../.env') });
}

console.log(`✓ Loaded environment: ${environment} from ${envFile}`);

export default {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3001,
  VITE_API_URL: process.env.VITE_API_URL,
  GOOGLE_MAPS_API_KEY: process.env.VITE_GOOGLE_MAPS_API_KEY,
};
