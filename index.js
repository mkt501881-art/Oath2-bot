require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const app = express();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// セッション保存
const states = new Map();

// ===== Discord =====
client.on("ready", async () => {
  console.log(`ログイン: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("verify")
      .setDescription("認証を開始")
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ スラッシュコマンド登録完了");
  } catch (err) {
    console.error("コマンド登録失敗:", err);
  }
});

client.on("interactionCreate", async (interaction) => {

  // ===== /verify =====
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "verify") {

      const button = new ButtonBuilder()
        .setCustomId("start_oauth")
        .setLabel("Googleで認証")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      return interaction.reply({
        content: "ボタンを押して認証を開始してください",
        components: [row],
        ephemeral: true
      });
    }
  }

  // ===== ボタン押下 =====
  if (interaction.isButton()) {
    if (interaction.customId === "start_oauth") {

      // state生成（強化版）
      const state = crypto.randomBytes(16).toString("hex");

      states.set(state, {
        userId: interaction.user.id,
        expires: Date.now() + 5 * 60 * 1000 // 5分
      });

      // OAuth URL
      const url =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${process.env.GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${process.env.REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=openid%20email%20profile` +
        `&state=${state}`;

      return interaction.reply({
        content: `👇 このリンクから認証してください\n${url}`,
        ephemeral: true
      });
    }
  }
});

// ===== OAuth callback =====
app.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    console.log("=== CALLBACK START ===");
    console.log("code:", code);
    console.log("state:", state);

    const data = states.get(state);
    console.log("state data:", data);

    if (!data) {
      return res.send("invalid state");
    }

    if (Date.now() > data.expires) {
      states.delete(state);
      return res.send("⏰ 期限切れ（5分）");
    }

    const userId = data.userId;

    // ===== トークン =====
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

    console.log("TOKEN:", tokenRes.data);

    const accessToken = tokenRes.data.access_token;

    // ===== ユーザー情報 =====
    const userRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log("USER:", userRes.data);

    const email = userRes.data.email;
    console.log("EMAIL:", email);

    if (!email) {
      return res.send("❌ email取得できてない");
    }

    if (!email.endsWith("@stg.nada.ac.jp")) {
      return res.send(`❌ ドメイン不許可: ${email}`);
    }

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);

    await member.roles.add(process.env.ROLE_ID);

    states.delete(state);

    return res.send("✅ 認証成功");

  } catch (err) {
    console.error("ERROR:", err.response?.data || err);
    return res.send("エラー発生");
  }
});

    const userId = data.userId;

    // ===== トークン取得 =====
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

    // ===== ユーザー情報 =====
    const userRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const email = userRes.data.email;

    // ===== ドメインチェック =====
    if (!email.endsWith("@stg.nada.ac.jp")) {
      states.delete(state);
      return res.send("❌ ドメイン不許可");
    }

    // ===== ロール付与 =====
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);

    await member.roles.add(process.env.ROLE_ID);

    states.delete(state);

    return res.send("✅ 認証成功！Discordに戻って確認してください");

  } catch (err) {
    console.error(err);
    return res.send("エラーが発生しました");
  }
});

// ===== HTTP（Uptime用） =====
app.get("/", (req, res) => {
  res.send("alive");
});

// ===== 起動 =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web起動: ${PORT}`);
});

client.login(process.env.TOKEN);
