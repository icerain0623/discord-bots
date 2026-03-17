import 'dotenv/config'
import { REST, Routes } from 'discord.js'
import { data as setupIntroData } from './commands/setupIntro.js'

const commands = [setupIntroData.toJSON()]
const rest = new REST().setToken(process.env.DISCORD_TOKEN)

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
)
console.log('✅ スラッシュコマンドを登録しました')
