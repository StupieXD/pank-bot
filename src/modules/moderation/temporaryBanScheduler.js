import { getExpiredTemporaryBans } from '../../database/repositories/moderationCaseRepository.js';
import { expireTemporaryBan } from '../../services/moderationService.js';

const CHECK_INTERVAL_MS = 60_000;
let timer = null;
let running = false;

export function initialiseTemporaryBanScheduler(client) {
  if (timer) clearInterval(timer);
  void processExpiredTemporaryBans(client);
  timer = setInterval(() => void processExpiredTemporaryBans(client), CHECK_INTERVAL_MS);
  timer.unref?.();
  console.log('Temporary ban scheduler initialised.');
}

async function processExpiredTemporaryBans(client) {
  if (running) return;
  running = true;
  try {
    const cases = getExpiredTemporaryBans();
    for (const moderationCase of cases) {
      const guild = client.guilds.cache.get(moderationCase.guildId)
        ?? await client.guilds.fetch(moderationCase.guildId).catch(() => null);
      if (!guild) continue;
      const ban = await guild.bans.fetch(moderationCase.userId).catch(() => null);
      if (ban) {
        const success = await guild.members.unban(
          moderationCase.userId,
          `Temporary ban case #${moderationCase.caseNumber} expired.`
        ).then(() => true).catch((error) => {
          console.error(`Failed to expire temporary ban case #${moderationCase.caseNumber}:`, error);
          return false;
        });
        if (!success) continue;
      }
      expireTemporaryBan({ guildId: moderationCase.guildId, caseNumber: moderationCase.caseNumber });
    }
  } finally {
    running = false;
  }
}
