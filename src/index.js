import 'dotenv/config'
import { Client, GatewayIntentBits, Events } from 'discord.js'
import { execute as setupIntroExecute } from './commands/setupIntro.js'
import { handleButton } from './interactions/buttons.js'
import { handleModalSubmit } from './interactions/modals.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once(Events.ClientReady, (c) => {
  console.log(`✅ ログイン: ${c.user.tag}`)
})

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-intro') {
      await setupIntroExecute(interaction)
    } else if (interaction.isButton()) {
      await handleButton(interaction)
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction)
    }
  } catch (err) {
    console.error('InteractionCreate エラー:', err)
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '予期しないエラーが発生しました。', ephemeral: true }).catch(() => {})
    }
  }
})

client.login(process.env.DISCORD_TOKEN)
