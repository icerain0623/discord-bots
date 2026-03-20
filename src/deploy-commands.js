import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js'

const commands = [
  new SlashCommandBuilder()
    .setName('setup-intro')
    .setDescription('自己紹介パネルをこのチャンネルに設置します（管理者のみ）')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('emoji-stats')
    .setDescription('絵文字ランキングを表示します')
    .addStringOption(option =>
      option
        .setName('期間')
        .setDescription('集計期間を選択')
        .setRequired(true)
        .addChoices(
          { name: '今週', value: 'this_week' },
          { name: '先週', value: 'last_week' },
          { name: '今月', value: 'this_month' },
          { name: '先月', value: 'last_month' },
          { name: '全期間', value: 'all' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Bot のステータスを表示します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
]

const rest = new REST().setToken(process.env.DISCORD_TOKEN)

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
)
console.log('✅ スラッシュコマンドを登録しました')
