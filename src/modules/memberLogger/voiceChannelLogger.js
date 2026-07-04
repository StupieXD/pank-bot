import { EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';

const JOIN_COLOUR = 0x2ecc71;
const LEAVE_COLOUR = 0xe74c3c;
const MOVE_COLOUR = 0x3498db;

export async function handleVoiceChannelUpdate(oldState, newState) {
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  if (oldChannel?.id === newChannel?.id) return;

  const logChannel = await newState.client.channels
    .fetch(config.messageLogChannelId)
    .catch(() => null);

  if (!logChannel) {
    console.log('❌ Could not find member log channel.');
    return;
  }

  if (!oldChannel && newChannel) {
    return logChannel.send({
      embeds: [buildJoinEmbed(newState.member, newChannel)]
    });
  }

  if (oldChannel && !newChannel) {
    return logChannel.send({
      embeds: [buildLeaveEmbed(oldState.member, oldChannel)]
    });
  }

  if (oldChannel && newChannel) {
    return logChannel.send({
      embeds: [buildMoveEmbed(newState.member, oldChannel, newChannel)]
    });
  }
}

function buildJoinEmbed(member, channel) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setColor(JOIN_COLOUR)
    .setTitle('🔊 Voice Channel Joined')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${member.id}>\n` +
          `Username: ${member.user.tag}`,
        inline: false
      },
      {
        name: '📍 Channel',
        value: `<#${channel.id}>`,
        inline: false
      },
      {
        name: '🕒 Joined',
        value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${member.id}` });
}

function buildLeaveEmbed(member, channel) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setColor(LEAVE_COLOUR)
    .setTitle('🔇 Voice Channel Left')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${member.id}>\n` +
          `Username: ${member.user.tag}`,
        inline: false
      },
      {
        name: '📍 Channel',
        value: `<#${channel.id}>`,
        inline: false
      },
      {
        name: '🕒 Left',
        value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${member.id}` });
}

function buildMoveEmbed(member, fromChannel, toChannel) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setColor(MOVE_COLOUR)
    .setTitle('🔄 Voice Channel Moved')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '👤 User',
        value:
          `<@${member.id}>\n` +
          `Username: ${member.user.tag}`,
        inline: false
      },
      {
        name: '📤 From',
        value: `<#${fromChannel.id}>`,
        inline: true
      },
      {
        name: '📥 To',
        value: `<#${toChannel.id}>`,
        inline: true
      },
      {
        name: '🕒 Moved',
        value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${member.id}` });
}
