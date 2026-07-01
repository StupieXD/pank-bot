export async function registerEvents(client, events) {
  for (const event of events) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }

    console.log(`✅ Registered event: ${event.name}`);
  }
}
