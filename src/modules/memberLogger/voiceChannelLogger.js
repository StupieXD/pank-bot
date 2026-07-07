import { EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';

const JOIN_COLOUR = 0x2ecc71;
const LEAVE_COLOUR = 0xe74c3c;
const MOVE_COLOUR = 0x3498db;

const ENABLED_COLOUR = 0x2ecc71;
const DISABLED_COLOUR = 0xe67e22;
const SERVER_ACTION_COLOUR = 0xe74c3c;

export async function handleVoiceChannelUpdate(oldState, newState) {
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

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

  if (oldChannel?.id !== newChannel?.id && oldChannel && newChannel) {
    return logChannel.send({
      embeds: [buildMoveEmbed(newState.member, oldChannel, newChannel)]
    });
  }

  const embeds = [];

  if (oldState.selfMute !== newState.selfMute) {
    embeds.push(
      buildVoiceActivityEmbed({
        member: newState.member,
        title: newState.selfMute ? '🎙️ Self Muted' : '🎙️ Self Unmuted',
        colour: newState.selfMute ? DISABLED_COLOUR : ENABLED_COLOUR,
        actionLabel: newState.selfMute ? 'Muted' : 'Unmuted'
      })
    );
  }

  if (oldState.selfDeaf !== newState.selfDeaf) {
    embeds.push(
      buildVoiceActivityEmbed({
        member: newState.member,
        title: newState.selfDeaf ? '🎧 Self Deafened' : '🎧 Self Undeafened',
        colour: newState.selfDeaf ? DISABLED_COLOUR : ENABLED_COLOUR,
        actionLabel: newState.selfDeaf ? 'Deafened' : 'Undeafened'
      })
    );
  }

  if (oldState.serverMute !== newState.serverMute) {
    embeds.push(
      buildVoiceActivityEmbed({
        member: newState.member,
        title: newState.serverMute ? '🔇 Voice Muted' : '🔊 Voice Unmuted',
        colour: SERVER_ACTION_COLOUR,
        actionLabel: newState.serverMute ? 'Muted' : 'Unmuted'
      })
    );
  }

  if (oldState.serverDeaf !== newState.serverDeaf) {
    embeds.push(
      buildVoiceActivityEmbed({
        member: newState.member,
        title: newState.serverDeaf ? '🙊 Voice Deafened' : '🙉 Voice Undeafened',
        colour: SERVER_ACTION_COLOUR,
        actionLabel: newState.serverDeaf ? 'Deafened' : 'Undeafened'
      })
    );
  }

  if (oldState.streaming !== newState.streaming) {
    embeds.push(
      buildVoiceActivityEmbed({
        member: newState.member,
        title: newState.streaming ? '📺 Started Streaming' : '⏹️ Stopped Streaming',
        colour: newState.streaming ? ENABLED_COLOUR : DISABLED_COLOUR,
        actionLabel: newState.streaming ? 'Started Streaming' : 'Stopped Streaming'
      })
    );
  }

  if (oldState.selfVideo !== newState.selfVideo) {
    embeds.push(
      buildVoiceActivityEmbed({
        member: newState.member,
        title: newState.selfVideo ? '📹 Camera Enabled' : '📷 Camera Disabled',
        colour: newState.selfVideo ? ENABLED_COLOUR : DISABLED_COLOUR,
        actionLabel: newState.selfVideo ? 'Camera Enabled' : 'Camera Disabled'
      })
    );
  }

  if (embeds.length > 0) {
    await logChannel.send({ embeds });
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

function buildVoiceActivityEmbed({ member, title, colour, actionLabel }) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setColor(colour)
    .setTitle(title)
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
        name: `🕒 ${actionLabel}`,
        value: `<t:${timestamp}:R> (<t:${timestamp}:F>)`,
        inline: false
      }
    )
    .setFooter({ text: `🆔 User ID: ${member.id}` });
}
