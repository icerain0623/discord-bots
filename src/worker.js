import { verifyDiscordRequest } from './utils/verify.js'
import { execute as setupIntroExecute } from './commands/setupIntro.js'
import { handleEmojiStats } from './commands/emojiStats.js'
import { handleStatus } from './commands/status.js'
import { handleButton } from './interactions/buttons.js'
import { handleModalSubmit } from './interactions/modals.js'

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.text()
    const isValid = await verifyDiscordRequest(request, body, env.DISCORD_PUBLIC_KEY)
    if (!isValid) {
      return new Response('Unauthorized', { status: 401 })
    }

    const interaction = JSON.parse(body)

    if (interaction.type === InteractionType.PING) {
      return Response.json({ type: 1 })
    }

    try {
      let result

      if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'setup-intro'
      ) {
        result = await setupIntroExecute(interaction, env)
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'status'
      ) {
        result = await handleStatus(interaction, env)
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'emoji-stats'
      ) {
        result = await handleEmojiStats(interaction, env)
      } else if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        result = await handleButton(interaction, env)
      } else if (interaction.type === InteractionType.MODAL_SUBMIT) {
        result = await handleModalSubmit(interaction, env)
      } else {
        return new Response('Unknown interaction', { status: 400 })
      }

      return Response.json(result)
    } catch (err) {
      console.error('Worker error:', err)
      return Response.json({
        type: 4,
        data: { content: '予期しないエラーが発生しました。', flags: 64 },
      })
    }
  },
}
