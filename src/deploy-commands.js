import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ChannelType } from 'discord.js'

const commands = [
  new SlashCommandBuilder()
    .setName('setup-intro')
    .setDescription('自己紹介パネルをこのチャンネルに設置します（管理者のみ）')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
  new ContextMenuCommandBuilder()
    .setName('検閲')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('censor-settings')
    .setDescription('検閲機能の設定を変更します')
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('検閲モード')
        .setRequired(true)
        .addChoices(
          { name: '全メッセージ対象', value: 'all' },
          { name: '自分のメッセージのみ', value: 'self' },
          { name: 'オフ', value: 'off' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('org')
    .setDescription('組織図を管理します')
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('組織図パネルを設置します')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('設置先チャンネル')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('refresh')
        .setDescription('組織図を最新のロール情報で更新します')
    )
    .addSubcommand(sub =>
      sub.setName('config')
        .setDescription('部門定義を編集します')
    )
    .addSubcommand(sub =>
      sub.setName('debug')
        .setDescription('組織図をメンションなしでプレビューします')
    )
    .addSubcommand(sub =>
      sub.setName('dept-add')
        .setDescription('部門を追加します')
        .addStringOption(opt =>
          opt.setName('name').setDescription('部門名').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('dept-remove')
        .setDescription('部門を削除します')
        .addStringOption(opt =>
          opt.setName('name').setDescription('部門名').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('role-add')
        .setDescription('部門にロールを追加します')
        .addStringOption(opt =>
          opt.setName('dept').setDescription('部門名').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('role').setDescription('ロール名').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('role-remove')
        .setDescription('部門からロールを削除します')
        .addStringOption(opt =>
          opt.setName('dept').setDescription('部門名').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('role').setDescription('ロール名').setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
]

const rest = new REST().setToken(process.env.DISCORD_TOKEN)

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
)
console.log('✅ スラッシュコマンドを登録しました')
