const buttonHandlers = new Map();
const modalHandlers = new Map();
const handledInteractionIds = new Set();
const INTERACTION_ID_TTL_MS = 15 * 60 * 1000;

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
  if (handledInteractionIds.has(interaction.id)) {
    return true;
  }

  const entry = [...registry.entries()]
    .sort(([a], [b]) => b.length - a.length)
    .find(([prefix]) => interaction.customId.startsWith(prefix));

  if (!entry) return false;

  const [, handler] = entry;
  handledInteractionIds.add(interaction.id);
  const expiry = setTimeout(() => {
    handledInteractionIds.delete(interaction.id);
  }, INTERACTION_ID_TTL_MS);
  expiry.unref?.();

  await handler(interaction);
  return true;
}
