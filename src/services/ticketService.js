import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { ensureTicketInfrastructure } from './ticketInfrastructureService.js';
import { GUILD_CONFIG_KEYS, getConfigValue } from './guildConfigService.js';
import { createTicket, getTicketByChannel, addTicketMessage, addTicketAudit, updateTicketStatus } from '../database/repositories/ticketRepository.js';
import { buildInternalTicketTranscript } from './ticketTranscriptService.js';

export async function createLinkedTicket({ guild, creator, subject, details }) {
  const { tickets, staff, closed, log } = await ensureTicketInfrastructure(guild, creator.id);
  const staffRoleId = getConfigValue(guild.id, GUILD_CONFIG_KEYS.STAFF_ROLE_ID);
  const nextName = `ticket-${Date.now().toString().slice(-6)}`;
  const userChannel = await guild.channels.create({
    name: nextName, type: ChannelType.GuildText, parent: tickets.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: creator.id, allow: [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks] },
      { id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks] }
    ], reason: 'Pank ticket opened'
  });
  const staffChannel = await guild.channels.create({
    name: `staff-${nextName}`, type: ChannelType.GuildText, parent: staff.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks] }
    ], reason: 'Pank private ticket staff channel'
  });
  const ticket = createTicket({ guildId:guild.id, creatorId:creator.id, userChannelId:userChannel.id, staffChannelId:staffChannel.id, subject, details });
  const numberName=`ticket-${String(ticket.ticket_number).padStart(4,'0')}`;
  await userChannel.setName(numberName);
  await staffChannel.setName(`staff-${numberName}`);
  await userChannel.send({ content:`<@${creator.id}>\n**Ticket #${ticket.ticket_number}: ${subject}**\n${details}\n\nA moderator will reply through Pank. Moderator identities remain private.` });
  await staffChannel.send({ content:`**Staff workspace for Ticket #${ticket.ticket_number}**\nUser: <@${creator.id}> (${creator.id})\nSubject: ${subject}\nDetails: ${details}\n\nMessages typed here are automatically sent to the user-facing ticket by Pank.` });
  await log.send({ content:`Ticket #${ticket.ticket_number} opened by <@${creator.id}>. User: <#${userChannel.id}> Staff: <#${staffChannel.id}>` }).catch(()=>null);
  return { ticket, userChannel, staffChannel, closed, log };
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
