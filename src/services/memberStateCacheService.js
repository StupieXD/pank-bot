import { cacheMemberState } from '../utils/memberStateCache.js';

export async function initialiseMemberStateCache(client) {
  console.log('🔄 Initialising member state cache...');

  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();

      for (const member of members.values()) {
        cacheMemberState(member);
      }

      console.log(`✅ Cached ${members.size} members for ${guild.name}`);
    } catch (error) {
      console.error(`❌ Failed to cache members for ${guild.name}:`, error);
    }
  }

  console.log('✅ Member state cache initialised.');
}
