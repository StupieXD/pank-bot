import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function loadEvents(client) {
    const eventsPath = path.join(__dirname, "../events");

    const files = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));

    for (const file of files) {
        const event = await import(`../events/${file}`);

        if (event.default.once) {
            client.once(event.default.name, (...args) => event.default.execute(...args, client));
        } else {
            client.on(event.default.name, (...args) => event.default.execute(...args, client));
        }
    }
}
