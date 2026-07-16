import fs from 'node:fs';
import path from 'node:path';
import {
  Collection
} from 'discord.js';
import {
  fileURLToPath,
  pathToFileURL
} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadCommands(client) {
  const commandsPath = path.join(
    __dirname,
    '../commands'
  );

  const commandFiles = findJavaScriptFiles(
    commandsPath
  );

  client.commands = new Collection();

  for (const filePath of commandFiles) {
    const command = await import(
      pathToFileURL(filePath).href
    );

    if (!command.data || !command.execute) {
      console.warn(
        `⚠️ Skipping command file ${filePath}: ` +
        'missing data or execute'
      );

      continue;
    }

    const commandName = command.data.name;

    if (!commandName) {
      console.warn(
        `⚠️ Skipping command file ${filePath}: ` +
        'command has no name'
      );

      continue;
    }

    if (client.commands.has(commandName)) {
      throw new Error(
        `Duplicate command name detected: ${commandName}`
      );
    }

    client.commands.set(commandName, command);

    console.log(
      `✅ Loaded command: /${commandName}`
    );
  }

  console.log(
    `✅ Loaded ${client.commands.size} slash commands.`
  );
}

function findJavaScriptFiles(directoryPath) {
  const entries = fs.readdirSync(
    directoryPath,
    {
      withFileTypes: true
    }
  );

  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(
      directoryPath,
      entry.name
    );

    if (entry.isDirectory()) {
      files.push(
        ...findJavaScriptFiles(entryPath)
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js')
    ) {
      files.push(entryPath);
    }
  }

  return files.sort();
}
