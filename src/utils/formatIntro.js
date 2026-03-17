const FALLBACK = '未回答'
const f = (val) => val?.trim() || FALLBACK

export function formatIntro(username, data) {
  return `
✨ **${username}** さんの自己紹介 ✨

【基本】
名前：${f(data.name)}
性別：${f(data.gender)}
年齢：${f(data.age)}
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

【もっと！】
いま欲しいもの：${f(data.want)}
ペットを飼うなら：${f(data.pet)}
休日はどう過ごす？：${f(data.holiday)}
返信は早い？：${f(data.reply)}
ゲームやってる？：${f(data.game)}

【一言！】
${f(data.oneword)}
`.trim()
}
