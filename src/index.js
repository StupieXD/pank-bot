import 'dotenv/config';

import { createClient } from './core/client.js';
import { loadEvents } from './handlers/eventHandler.js';
import { validateConfig } from './config/validateConfig.js';
import { config } from './config/config.js';

validateConfig();

const client = createClient();

await loadEvents(client);

await client.login(config.discordToken);
