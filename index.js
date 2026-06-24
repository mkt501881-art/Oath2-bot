require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// セッション保存
const states = new Map();

// ===== Discord =====
client.on("ready", () => {
  console.log(`ログイン: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "verify") {

    const state = Math.random().toString(36).substring(2, 15);
    states.set(state, interaction.user.id);

    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${process.env.GOOGLE_CLIENT_ID}` +
      `&redirect_uri=${process.env.REDIRECT_URI}` +
      `&response_type=code` +
      `&scope=openid%20email%20profile` +
      `&state=${state}`;

    await interaction.reply({
      content: `👇 ここから認証\n${url}`,
      ephemeral: true
    });
  }
});

// ===== OAuth callback =====
app.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!states.has(state)) {
    return res.send("invalid state");
  }

  const userId = states.get(state);

  // アクセストークン取得
  const tokenRes = await axios.post(
    "https://oauth2.googleapis.com/token",
    {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
      grant_type: "authorization_code"
    }
  );

  const accessToken = tokenRes.data.access_token;

  // ユーザー情報取得
  const userRes = await axios.get(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const email = userRes.data.email;

  // ドメインチェック
  if (!email.endsWith("@example.com")) {
    return res.send("ドメイン不許可");
  }

  // ===== Discordロール付与 =====
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);

    await member.roles.add(process.env.ROLE_ID);

    res.send("✅ 認証成功！Discordに戻って確認してください");
  } catch (e) {
    console.error(e);
    res.send("エラー発生");
  }

  states.delete(state);
});

// ===== HTTP サーバー =====
app.get("/", (req, res) => {
  res.send("alive");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web起動: ${PORT}`);
});

client.login(process.env.TOKEN);