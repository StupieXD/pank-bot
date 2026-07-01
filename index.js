import 'dotenv/config';

import { createClient } from './src/core/client.js';
import { registerEvents } from './src/core/registerEvents.js';

import * as ready from './src/events/ready.js';
import * as messageCreate from './src/events/messageCreate.js';
import * as messageBulkDelete from './src/events/messageBulkDelete.js';

import { config } from './src/config.js';

const client = createClient();

await registerEvents(client, [
  ready,
  messageCreate,
  messageBulkDelete
]);

await client.login(config.discordToken);
