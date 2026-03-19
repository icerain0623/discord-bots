const FALLBACK = '未回答'
const f = (val) => val?.trim() || FALLBACK

const MORE_KEYS = ['want', 'pet', 'brand', 'holiday', 'reply_speed', 'kinoko_takenoko', 'taiyaki']

function hasMoreSection(data) {
  return MORE_KEYS.some((k) => data[k]?.trim())
}

export function formatIntro(username, data) {
  data = data ?? {}

  let text = `\
✨ **${username}** さんの自己紹介 ✨

【基本】
名前：${f(data.name)}
肩書き：${f(data.title)}
出身地：${f(data.hometown)}
趣味：${f(data.hobby)}
特技：${f(data.skill)}
マイブーム：${f(data.myboom)}

【好きな物】
食べ物：${f(data.food)}
飲み物：${f(data.drink)}
場所：${f(data.place)}
推し・キャラクター：${f(data.oshi)}
音楽：${f(data.music)}
本：${f(data.book)}

【一言！】
${f(data.oneword)}`

  if (hasMoreSection(data)) {
    text += `

【もっと！】
いま欲しいもの：${f(data.want)}
ペットを飼うなら：${f(data.pet)}
好きなブランド：${f(data.brand)}
休日はどう過ごす？：${f(data.holiday)}
返信は早い？：${f(data.reply_speed)}
きのこ派 or たけのこ派：${f(data.kinoko_takenoko)}
たい焼きの食べ方：${f(data.taiyaki)}`
  }

  return text
}
