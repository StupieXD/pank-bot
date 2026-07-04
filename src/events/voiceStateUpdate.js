import { Events } from 'discord.js';
import { handleVoiceChannelUpdate } from '../modules/memberLogger/voiceChannelLogger.js';

export const name = Events.VoiceStateUpdate;
export const once = false;

export async function execute(oldState, newState) {
  await handleVoiceChannelUpdate(oldState, newState);
}
