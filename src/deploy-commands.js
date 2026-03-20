import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js'

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
  new SlashCommandBuilder()
    .setName('matchup')
    .setDescription('交流マッチング機能（テスト機能）')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('マッチング募集を開始')
        .addIntegerOption(opt =>
          opt.setName('group_size')
            .setDescription('グループサイズ（2〜4）')
            .setRequired(true)
            .setMinValue(2)
            .setMaxValue(4)
        )
        .addChannelOption(opt =>
          opt.setName('category')
            .setDescription('チャンネル作成先カテゴリ（省略時は自動作成）')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('run')
        .setDescription('マッチングを実行してチャンネルを作成')
    )
    .addSubcommand(sub =>
      sub.setName('terminate')
        .setDescription('マッチングイベントを終了（チャンネル削除）')
    )
    .addSubcommandGroup(group =>
      group.setName('topics')
        .setDescription('トピック管理')
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('トピックを追加')
            .addStringOption(opt =>
              opt.setName('name').setDescription('トピック名').setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub.setName('remove')
            .setDescription('トピックを削除')
            .addStringOption(opt =>
              opt.setName('name').setDescription('トピック名').setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('トピック一覧を表示')
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('contact')
    .setDescription('モデレーターに匿名で連絡します（通報・相談など）')
    .toJSON(),
]

const rest = new REST().setToken(process.env.DISCORD_TOKEN)

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
)
console.log('✅ スラッシュコマンドを登録しました')
