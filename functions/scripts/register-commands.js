// One-off: registers the bot's slash commands with Discord. Re-run whenever
// the command list below changes. Reads its credentials from the environment
// so nothing secret lives in the repo:
//
//   DISCORD_BOT_TOKEN=$(firebase functions:secrets:access DISCORD_BOT_TOKEN) \
//   DISCORD_APPLICATION_ID=<application id> \
//   node functions/scripts/register-commands.js
const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
if (!token || !appId) {
  console.error('Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID first.');
  process.exit(1);
}

const commands = [
  {
    name: 'link',
    description: 'Link your Discord to your tournament account to get match DMs',
    options: [
      {
        type: 3, // STRING
        name: 'code',
        description: 'The 6-character code from your profile in the tournament app',
        required: true,
      },
    ],
  },
];

fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
}).then(async (res) => {
  console.log(res.status, await res.text());
  process.exit(res.ok ? 0 : 1);
});
