export const zh_hans = {
  inline_keyboard: [
    [{ text: '🤖 Fuyo AI', callback_data: 'chat_with_ai' }],
    [
      {
        text: '🎮 Fuyo电报游戏',
        web_app: { url: 'https://game.fuyo.lol/' },
      },
    ],
    [{ text: '🐦 在X上关注我们', url: 'https://x.com/FuyoAI' }],
    [{ text: '💬 加入社区', url: 'https://t.me/fuyoapp' }],
    [{ text: '📲 下载Fuyo App', url: 'https://app.fuyo.lol/' }],
    [{ text: '📖 了解更多', url: 'https://docs.fuyo.lol/' }],
  ],
  caption:
    '<b>欢迎来到Fuyo AI - 你的私人博彩AI 助理！🤖💰</b>\n\n' +
    '<b>🎰投注$10，获得$10现金返还</b>\n\n' +
    '<b>🤑通过推荐赚取被动收入</b>\n\n' +
    '<b>🪙赚取XP和$FUYO空投</b>\n\n' +
    '<b>🔥双倍中奖机会 - 4D彩票最高6500倍回报和季节性大奖！</b>\n\n' +
    '<b>致富. #GetFuyoAI!</b>\n\n' +
    '<b>👇点击按钮开始：</b>',
  noAccountMessage: (tgUserName: string) =>
    `💸 想搞钱吗？💸\n\n` +
    `嗨 ${tgUserName}！准备好用<b>Fuyo AI</b>赢取大奖了吗？ 🏆\n\n` +
    `<b>与我们的AI聊天</b> 预测你的幸运4D号码。 🔥\n\n` +
    `🔥 今天就赚取真正的钱！ 👉 https://t.me/fuyo_game_bot/fuyo_game\n\n`,
  initialMessage: `嘿！ 👋 我是你的专属FUYO AI。对4D投注有任何问题，或者只是想聊聊幸运数字？让我们来聊聊——我在这里等你！ 🍀`,
};
