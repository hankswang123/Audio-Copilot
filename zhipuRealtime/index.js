import { RealtimeRelayZhipu } from './lib/relay.js';

import 'dotenv/config'; // Auto-loads environment variables

const OPENAI_API_KEY = process.env.ZHIPUAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error(
    `Environment variable "OPENAI_API_KEY" is required.\n` +
      `Please set it in your .env file.`
  );
  process.exit(2);
}else{console.log("API_KEY is set is " + OPENAI_API_KEY)}

const PORT = parseInt(process.env.PORT) || 8081;

const relay = new RealtimeRelayZhipu(OPENAI_API_KEY);
relay.listen(PORT);
