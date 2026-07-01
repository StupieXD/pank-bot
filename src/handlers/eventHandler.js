import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadEvents(client) {
  const eventsPath = path.join(__dirname, '../events');
  const files = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(eventsPath, file);
    const event = await import(pathToFileURL(filePath).href);

    if (!event.name || !event.execute) {
      console.warn(`⚠️ Skipping event file ${file}: missing name or execute`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }

    console.log(`✅ Loaded event: ${event.name}`);
  }
}
