const buttonHandlers = new Map();
const modalHandlers = new Map();

export function registerButtonHandler(prefix, handler) {
  registerHandler(buttonHandlers, prefix, handler, 'button');
}

export function registerModalHandler(prefix, handler) {
  registerHandler(modalHandlers, prefix, handler, 'modal');
}

export async function routeButtonInteraction(interaction) {
  return routeInteraction(buttonHandlers, interaction);
}

export async function routeModalInteraction(interaction) {
  return routeInteraction(modalHandlers, interaction);
}

function registerHandler(registry, prefix, handler, type) {
  if (!prefix || typeof handler !== 'function') {
    throw new TypeError(`A ${type} handler requires a prefix and function.`);
  }

  if (registry.has(prefix)) {
    throw new Error(`Duplicate ${type} interaction prefix: ${prefix}`);
  }

  registry.set(prefix, handler);
}

async function routeInteraction(registry, interaction) {
  const entry = [...registry.entries()]
    .sort(([a], [b]) => b.length - a.length)
    .find(([prefix]) => interaction.customId.startsWith(prefix));

  if (!entry) return false;

  const [, handler] = entry;
  await handler(interaction);
  return true;
}
