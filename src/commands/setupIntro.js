import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js'

export const data = new SlashCommandBuilder()
  .setName('setup-intro')
  .setDescription('自己紹介パネルをこのチャンネルに設置します（管理者のみ）')

export async function execute(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('intro_start')
      .setLabel('✏️ 自己紹介を書く')
      .setStyle(ButtonStyle.Primary),
  )

  await interaction.channel.send({
    content: '**📝 自己紹介**\nボタンを押して自己紹介を投稿しましょう！',
    components: [row],
  })

  await interaction.reply({ content: 'パネルを設置しました！', ephemeral: true })
}
