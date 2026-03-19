import { getTextChannels, fetchAllChannelMessages, sendFollowup } from '../utils/discordApi.js'
import { countEmojis } from '../utils/emojiCounter.js'
import { formatEmojiStats } from '../utils/formatEmojiStats.js'

export async function collectAndRespond(interaction, env) {
  const guildId = interaction.guild_id
  const applicationId = env.CLIENT_ID
  const token = env.DISCORD_TOKEN
  const interactionToken = interaction.token

  try {
    const channels = await getTextChannels(guildId, token)
    const messages = await fetchAllChannelMessages(channels, token)
    const counts = countEmojis(messages)
    const embed = formatEmojiStats(counts, {
      channelCount: channels.length,
      messageCount: messages.length,
    })

    await sendFollowup(applicationId, interactionToken, embed)
  } catch (err) {
    console.error('emoji-stats error:', err)
    await sendFollowup(applicationId, interactionToken, {
      title: 'エラー',
      description: '絵文字の集計中にエラーが発生しました。',
      color: 0xed4245,
    })
  }
}
