export const en = {
  inline_keyboard: [
    [{ text: '🤖 Fuyo AI', callback_data: 'chat_with_ai' }],
    [
      {
        text: '🎮 Fuyo TG Game',
        web_app: { url: 'https://game.fuyo.lol/' },
      },
    ],
    [{ text: '🐦 Follow us on X', url: 'https://x.com/FuyoAI' }],
    [{ text: '💬 Join the Community', url: 'https://t.me/fuyoapp' }],
    [{ text: '📲 Download Fuyo App', url: 'https://app.fuyo.lol/' }],
    [{ text: '📖 Learn More', url: 'https://docs.fuyo.lol/' }],
  ],
  caption:
    '<b>Welcome to Fuyo AI - Your Personal AI Agent for GambleFi!🤖💰</b>\n\n' +
    '<b>🎰Bet $10, get $10 cashback</b>\n\n' +
    '<b>🤑Passive income with Refer-to-earn ambassador program</b>\n\n' +
    '<b>🪙Earn XP and $FUYO airdrop</b>\n\n' +
    '<b>🔥Double chance of winning - 4D lottery with up to 6500x returns and seasonal Jackpots!</b>\n\n' +
    '<b>Get rich. #GetFuyoAI!</b>\n\n' +
    '<b>👇Tap a button to get started:</b>',
  noAccountMessage: (tgUserName: string) =>
    `💸 WANT TO MAKE MONEY? 💸\n\n` +
    `Hi ${tgUserName}! Ready to win big with <b>Fuyo AI</b>? 🏆\n\n` +
    `<b>Chat with our AI</b> to predict your lucky 4D number. 🔥\n\n` +
    `🔥 Start making real money today! 👉 https://t.me/fuyo_game_bot/fuyo_game\n\n`,
  initialMessage: `Hey! 👋 I’m your FUYO AI buddy. Got questions about 4D draws, results, or just wanna chat about lucky numbers? Let’s talk—I’m here for you! 🍀`,
  verifyMobileMessage: (verificationCode: string, appName: string) =>
    `Please use the code - ${verificationCode} to verify your mobile number for logging into ${appName}`,
  telegramRegisteredMessage:
    'Please Contact Admin. Telegram already registered',
  shareContactButton: 'Share Contact',
  shareContactMessage: 'Please share your contact information:',
  telegramDataMismatchMessage:
    'Telegram data mismatch. Is the telegram Phone number same as the registered phone number?',
};
