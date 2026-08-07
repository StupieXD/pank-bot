import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from 'discord.js';
import { ensureTicketInfrastructure } from './ticketInfrastructureService.js';
import { GUILD_CONFIG_KEYS, getConfigValue } from './guildConfigService.js';
import { createTicket, getTicketByChannel, addTicketMessage, addTicketAudit, updateTicketStatus } from '../database/repositories/ticketRepository.js';
import { buildInternalTicketTranscript } from './ticketTranscriptService.js';

export async function createLinkedTicket({ guild, creator, subject, details }) {
  const infrastructure = await ensureTicketInfrastructure(guild, creator.id);
  const { tickets, staff, closed, log, staffRole } = infrastructure;
  const botMember = guild.members.me;

  if (!staffRole) {
    throw new Error('The configured Moderator role could not be found.');
  }

  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Pank needs Manage Channels to create ticket channels.');
  }

  const temporaryName = `ticket-${Date.now().toString().slice(-6)}`;
  let userChannel = null;
  let staffChannel = null;

  try {
    userChannel = await guild.channels.create({
      name: temporaryName,
      type: ChannelType.GuildText,
      parent: tickets.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: creator.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        },
        {
          id: staffRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory
          ],
          deny: [PermissionFlagsBits.SendMessages]
        },
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        }
      ],
      reason: 'Pank ticket opened'
    });

    staffChannel = await guild.channels.create({
      name: `staff-${temporaryName}`,
      type: ChannelType.GuildText,
      parent: staff.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: staffRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        },
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        }
      ],
      reason: 'Pank private ticket staff channel'
    });

    const ticket = createTicket({
      guildId: guild.id,
      creatorId: creator.id,
      userChannelId: userChannel.id,
      staffChannelId: staffChannel.id,
      subject,
      details
    });

    const numberedName = `ticket-${String(ticket.ticket_number).padStart(4, '0')}`;
    await userChannel.setName(numberedName);
    await staffChannel.setName(`staff-${numberedName}`);

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket-user:close:${ticket.id}:${creator.id}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Secondary)
    );

    await userChannel.send({
      content: [
        `<@${creator.id}>`,
        `**Ticket #${ticket.ticket_number}: ${subject}**`,
        details,
        '',
        'A moderator will reply through Pank. Individual moderator identities remain private.'
      ].join('\n'),
      components: [closeRow]
    });

    await staffChannel.send({
      content: [
        `**Staff workspace for Ticket #${ticket.ticket_number}**`,
        `User: <@${creator.id}> (${creator.id})`,
        `Subject: ${subject}`,
        `Details: ${details}`,
        '',
        'Messages typed here are automatically sent to the user-facing ticket by Pank.'
      ].join('\n')
    });

    await log.send({
      content: `Ticket #${ticket.ticket_number} opened by <@${creator.id}>. User: <#${userChannel.id}> Staff: <#${staffChannel.id}>`
    }).catch(() => null);

    return { ticket, userChannel, staffChannel, closed, log };
  } catch (error) {
    await staffChannel?.delete('Rolling back failed ticket creation').catch(() => null);
    await userChannel?.delete('Rolling back failed ticket creation').catch(() => null);
    throw error;
  }
}

export async function handleTicketMessage(message) {
  if (!message.guild || message.author.bot) return false;
  const ticket=getTicketByChannel(message.guild.id,message.channel.id);
  if (!ticket || ticket.status!=='open') return false;
  const attachments=[...message.attachments.values()].map(a=>a.url);
  if (message.channel.id===ticket.staff_channel_id) {
    const userChannel=await message.guild.channels.fetch(ticket.user_channel_id).catch(()=>null);
    if (!userChannel) return true;
    const sent=await userChannel.send({ content: message.content || undefined, files: attachments });
    addTicketMessage({guildId:message.guild.id,ticketId:ticket.id,authorId:message.author.id,authorType:'moderator',content:message.content,attachments,sourceMessageId:message.id,proxyMessageId:sent.id});
    addTicketAudit({guildId:message.guild.id,ticketId:ticket.id,actorId:message.author.id,action:'staff_reply',details:message.content?.slice(0,200)});
    return true;
  }
  if (message.channel.id===ticket.user_channel_id && message.author.id===ticket.creator_id) {
    const staffChannel=await message.guild.channels.fetch(ticket.staff_channel_id).catch(()=>null);
    const mirror=staffChannel ? await staffChannel.send({content:`**User:** <@${message.author.id}>\n${message.content || '*Attachment only*'}`,files:attachments}) : null;
    addTicketMessage({guildId:message.guild.id,ticketId:ticket.id,authorId:message.author.id,authorType:'user',content:message.content,attachments,sourceMessageId:message.id,proxyMessageId:mirror?.id});
    return true;
  }
  return false;
}

export async function setTicketClosed({ interaction, ticket, reason }) {
  const { closed, log }=await ensureTicketInfrastructure(interaction.guild,interaction.user.id);
  const user=await interaction.guild.channels.fetch(ticket.user_channel_id).catch(()=>null);
  const staff=await interaction.guild.channels.fetch(ticket.staff_channel_id).catch(()=>null);
  await user?.setParent(closed.id,{lockPermissions:false});
  await staff?.setParent(closed.id,{lockPermissions:false});
  await user?.permissionOverwrites.edit(ticket.creator_id,{SendMessages:false,AttachFiles:false});
  const updated=updateTicketStatus({ticketId:ticket.id,guildId:ticket.guild_id,status:'closed',actorId:interaction.user.id,reason});
  await user?.send({content:`This ticket has been closed.${reason?` Reason: ${reason}`:''}`});
  await staff?.send({content:`Ticket closed by <@${interaction.user.id}>.${reason?` Reason: ${reason}`:''}`});
  await log.send({content:`Ticket #${ticket.ticket_number} closed by <@${interaction.user.id}>.`,files:[buildInternalTicketTranscript(updated)]}).catch(()=>null);
  return updated;
}

export async function setTicketReopened({ interaction, ticket, reason }) {
  const { tickets, staff: staffCategory }=await ensureTicketInfrastructure(interaction.guild,interaction.user.id);
  const user=await interaction.guild.channels.fetch(ticket.user_channel_id).catch(()=>null);
  const staff=await interaction.guild.channels.fetch(ticket.staff_channel_id).catch(()=>null);
  await user?.setParent(tickets.id,{lockPermissions:false}); await staff?.setParent(staffCategory.id,{lockPermissions:false});
  await user?.permissionOverwrites.edit(ticket.creator_id,{SendMessages:true,AttachFiles:true});
  const updated=updateTicketStatus({ticketId:ticket.id,guildId:ticket.guild_id,status:'open',actorId:interaction.user.id,reason});
  await user?.send({content:'This ticket has been reopened.'}); await staff?.send({content:`Ticket reopened by <@${interaction.user.id}>.`});
  return updated;
}
