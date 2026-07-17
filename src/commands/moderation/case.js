import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getCase } from '../../services/moderationService.js';
export const data=new SlashCommandBuilder().setName('case').setDescription('View a moderation case.').addIntegerOption(o=>o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false);
export async function execute(interaction){
 const number=interaction.options.getInteger('number',true);
 const c=getCase({guildId:interaction.guildId,caseNumber:number});
 if(!c) return interaction.reply({content:`❌ Case #${number} could not be found.`,flags:MessageFlags.Ephemeral});
 const e=new EmbedBuilder().setTitle(`📁 Case #${c.caseNumber}`).addFields(
 {name:'Type',value:String(c.caseType??'Unknown'),inline:true},
 {name:'Status',value:String(c.status??'Unknown'),inline:true},
 {name:'User',value:`<@${c.userId}>\n\`${c.userId}\``},
 {name:'Moderator',value:`<@${c.moderatorId}>\n\`${c.moderatorId}\``},
 {name:'Reason',value:c.reason??'None'});
 return interaction.reply({embeds:[e],flags:MessageFlags.Ephemeral});
}
