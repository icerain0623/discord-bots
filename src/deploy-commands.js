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
  new SlashCommandBuilder()
    .setName('relay')
    .setDescription('1文リレーイベント機能')
    .addSubcommand(sub =>
      sub.setName('help')
        .setDescription('コマンドの使い方を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('リレーを開始します')
        .addStringOption(opt =>
          opt.setName('topic')
            .setDescription('お題')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('first_sentence')
            .setDescription('最初の一文')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('リレーの進行状況を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('last')
        .setDescription('最後の一文と執筆者を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('指定番号の文を削除します')
        .addIntegerOption(opt =>
          opt.setName('number')
            .setDescription('削除する文の番号')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('リレーを終了します（追記不可、データは残ります）')
    )
    .addSubcommand(sub =>
      sub.setName('post')
        .setDescription('全文を匿名で投稿します（データは残ります）')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('投稿先チャンネル')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('reveal')
        .setDescription('ネタバレ（執筆者一覧）を投稿します（データは残ります）')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('投稿先チャンネル')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('terminate')
        .setDescription('リレーデータを削除します')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('celebration-setup')
    .setDescription('お祝い保存機能を設定します')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('アーカイブ先チャンネル')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('操作を許可するロール')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new ContextMenuCommandBuilder()
    .setName('お祝い保存')
    .setType(ApplicationCommandType.Message)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('task')
    .setDescription('タスク管理')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('タスクを追加します')
        .addStringOption(opt =>
          opt.setName('name').setDescription('タスク名').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('deadline').setDescription('期限（YYYY-MM-DD）').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('priority')
            .setDescription('優先度')
            .setRequired(false)
            .addChoices(
              { name: '🔴 緊急', value: 'high' },
              { name: '🟡 通常', value: 'medium' },
              { name: '🟢 低め', value: 'low' },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('タスク一覧を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('タスクを完了にします')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('タスクID').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('タスクを削除します')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('タスクID').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('allow-role')
        .setDescription('ロールにタスク追加を許可します')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('対象ロール').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove-role')
        .setDescription('ロールのタスク追加許可を取り消します')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('対象ロール').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('allowed-roles')
        .setDescription('タスク追加許可ロール一覧を表示します')
    )
    .toJSON(),

  // --- 肩書コイン経済 ---
  new SlashCommandBuilder()
    .setName('economy')
    .setDescription('肩書コイン経済の参加者管理')
    .addSubcommand(sub =>
      sub.setName('join')
        .setDescription('肩書コイン経済に参加します')
    )
    .addSubcommand(sub =>
      sub.setName('leave')
        .setDescription('肩書コイン経済からの離脱を申請します')
    )
    .addSubcommand(sub =>
      sub.setName('approve-leave')
        .setDescription('離脱申請を承認します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName('confiscate')
            .setDescription('残高を回収するか（デフォルト: false）')
        )
    )
    .addSubcommand(sub =>
      sub.setName('reject-leave')
        .setDescription('離脱申請を却下します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('参加者一覧と統計を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('grant')
        .setDescription('ユーザーに肩書コインを付与します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('付与する金額')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('revoke')
        .setDescription('ユーザーから肩書コインを回収します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('回収する金額')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('bank')
    .setDescription('肩書コイン銀行')
    .addSubcommand(sub =>
      sub.setName('balance')
        .setDescription('残高を確認します')
    )
    .addSubcommand(sub =>
      sub.setName('send')
        .setDescription('他のユーザーに送金します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('送金先ユーザー')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('送金額')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('取引履歴を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('ranking')
        .setDescription('残高ランキングを表示します')
    )
    .addSubcommand(sub =>
      sub.setName('daily')
        .setDescription('デイリーボーナスを受け取ります')
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('slot')
    .setDescription('スロットマシン')
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('スロットを回します')
        .addIntegerOption(opt =>
          opt.setName('bet')
            .setDescription('賭け金（最低10）')
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName('rules')
        .setDescription('配当表とルールを表示します')
    )
    .toJSON(),
]

const rest = new REST().setToken(process.env.DISCORD_TOKEN)

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
)
console.log('✅ スラッシュコマンドを登録しました')
