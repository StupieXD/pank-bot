import 'dotenv/config';

import { config } from './config/config.js';
import { validateConfig } from './config/validateConfig.js';
import { createClient } from './core/client.js';
import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';

validateConfig();

const client = createClient();

await loadCommands(client);
await loadEvents(client);

await client.login(config.discordToken);
