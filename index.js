const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const config = require('./config.json');
const mysql = require('mysql2/promise');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Define your slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('사전예약')
        .setDescription('사전예약 메시지를 보냅니다.')
        .setDefaultMemberPermissions(0), // Only administrators can use this command (default: no one unless explicitly allowed)
    new SlashCommandBuilder()
        .setName('인원갱신')
        .setDescription('사전예약 인원수를 수동으로 갱신합니다.')
        // Removed setDefaultMemberPermissions(0) for this command
        // Permissions will now be managed by role check in the code or Discord's default permissions if not specified
].map(command => command.toJSON());

// Register slash commands when the bot is ready
client.once('ready', async () => {
    console.log(`${client.user.tag} 봇이 켜졌습니다!`);

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('request')
    .setLabel('신청하기')
    .setStyle(1) // PRIMARY style is 1
    .setEmoji('✨')
);

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) { // Handle button interactions
    if (interaction.customId === 'request') {

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let connection;
      try {
        connection = await mysql.createConnection({
          host: '127.0.0.1',
          user: 'root',
          password: '',
          database: 'vrpfx',
        });

        const [rows] = await connection.execute('SELECT * FROM bot_data WHERE discord_id=?;', [interaction.user.id]);

        if (rows.length === 0) {

          await connection.query('INSERT INTO bot_data(discord_id) VALUES(?);', [interaction.user.id]);

          const [reservationCountRows] = await connection.execute('SELECT COUNT(*) AS count FROM bot_data;');
          const reservationCount = reservationCountRows[0].count;

          const embed = new EmbedBuilder()
            .setTitle('WHALE 사전 예약')
            .setDescription('사전 예약이 완료되었습니다.')
            .setColor('#04c530');

          await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });

          // 사용자에게 DM 전송
          const dmEmbed = new EmbedBuilder()
            .setTitle('사전 예약')
            .setDescription(`**${reservationCount}**명과 함께하는 웨일 서버 입니다.\n\n- 사전예약을 해주셔서 감사합니다.`)
            .setColor('#0000FF'); // Blue hex code

          try {
            await interaction.user.send({ content: `@${interaction.user.tag}`, embeds: [dmEmbed] });
          } catch (error) {
            console.error('DM을 보내는 중 오류가 발생했습니다:', error);
          }

          const user = await interaction.guild.members.fetch(interaction.user.id);
          const logEmbed = new EmbedBuilder()
            .setTitle('사전 예약 로그')
            .setColor('#20d407') // Green hex code
            .addFields(
              { name: '유저', value: `${interaction.user}`, inline: true },
              { name: '별명', value: `${user.nickname || interaction.user.username + ' (별명 없음)'}`, inline: true },
              { name: '사전 예약 참여', value: `${reservationCount}명이 사전 예약에 참여하였습니다.` }
            );

          const logChannel = client.channels.cache.get('1376016148276973579'); // Log channel ID
          if (logChannel) {
            logChannel.send({ embeds: [logEmbed] });
          } else {
            console.error('로그 채널을 찾을 수 없습니다. 올바른 채널 ID를 설정했는지 확인하세요.');
          }

          // 사전 예약 참여 인원 수 업데이트 메시지 수정
          const updateChannel = client.channels.cache.get('1375834752493551778'); // Main reservation channel ID
          if (updateChannel) {
            try {
              const updateMessage = await updateChannel.messages.fetch('1376019564743102494'); // Main reservation message ID
              if (updateMessage) { // Check if message was successfully fetched
                const updateEmbed = new EmbedBuilder()
                  .setTitle('사전 예약')
                  .setDescription("**아래의 버튼을 눌러 사전 예약에 참여하세요.**\n\n- 오픈 후 파이브엠과 디스코드 연동 후 지정된 비콘에서 보상이 지급됩니다.\n- 해당 지급 방법 외 지급 방법은 없다는 점 참고바랍니다.")
                  .setColor('#0000FF')
                  .setFooter({ text: `${reservationCount}명이 테스트와 함께합니다 !`, iconURL: 'https://media.discordapp.net/attachments/1191348184107200593/1191348238758977656/Whale_RP.gif?ex=6833ad42&is=68325bc2&hm=062474ff8139199059bcaacd4ea42d058eae1f8e91ec76ec6bfda64a7fcd5892&=' });

                await updateMessage.edit({ embeds: [updateEmbed], components: [row] }); // Update the existing message, keeping the button
              } else {
                console.error('업데이트할 메시지를 찾을 수 없습니다. 올바른 메시지 ID를 설정했거나 메시지가 삭제되지 않았는지 확인하세요.');
              }
            } catch (error) {
              console.error('메시지를 가져오는 중 오류가 발생했습니다:', error);
            }
          } else {
            console.error('업데이트 채널을 찾을 수 없습니다. 올바른 채널 ID를 설정했는지 확인하세요.');
          }
        } else {
          // 이미 사전 예약된 사용자
          const embed = new EmbedBuilder()
            .setTitle('사전 예약')
            .setDescription('이미 사전 예약에 등록된 상태입니다.')
            .setColor('#FF0000'); // Red hex code

          await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      } catch (error) {
        console.error(error);
        await interaction.editReply({ content: '사전 예약 처리 중 오류가 발생했습니다.', flags: MessageFlags.Ephemeral });
      } finally {
        if (connection) await connection.end();
      }
    }
  } else if (interaction.isCommand()) { // Handle slash commands
        if (interaction.commandName === '사전예약') {
            await interaction.deferReply({ ephemeral: false }); // Make it visible to everyone

            let connection;
            try {
                connection = await mysql.createConnection({
                    host: '127.0.0.1',
                    user: 'root',
                    password: '',
                    database: 'vrpfx',
                });

                const [reservationCountRows] = await connection.execute('SELECT COUNT(*) AS count FROM bot_data;');
                const reservationCount = reservationCountRows[0].count;

                const embed = new EmbedBuilder()
                    .setTitle('사전 예약')
                    .setDescription("**아래의 버튼을 눌러 사전 예약에 참여하세요.**\n\n- 오픈 후 파이브엠과 디스코드 연동 후 지정된 비콘에서 보상이 지급됩니다.\n- 해당 지급 방법 외 지급 방법은 없다는 점 참고바랍니다.")
                    .setColor('#0000FF')
                    .setFooter({ text: `${reservationCount}명이 테스트와 함께합니다 !`, iconURL: 'https://media.discordapp.net/attachments/1191348184107200593/1191348238758977656/Whale_RP.gif?ex=6833ad42&is=68325bc2&hm=062474ff8139199059bcaacd4ea42d058eae1f8e91ec76ec6bfda64a7fcd5892&=' });

                const sentMessage = await interaction.editReply({ content: '@everyone', embeds: [embed], components: [row] });

                console.log(`Initial reservation message sent via slash command. Copy this ID for 'YOUR_MAIN_RESERVATION_MESSAGE_ID_HERE': ${sentMessage.id}`);


            } catch (error) {
                console.error(error);
                await interaction.editReply('사전 예약 정보를 가져오는 중 오류가 발생했습니다.');
            } finally {
                if (connection) await connection.end();
            }
        } else if (interaction.commandName === '인원갱신') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // **NEW: Check if the user has the required role**
            // Replace 'YOUR_REQUIRED_ROLE_ID_HERE' with the actual ID of the role that should be allowed to use this command.
            // How to get Role ID: Enable Developer Mode (User Settings -> Advanced), then right-click on the role in server settings and Copy ID.
            const requiredRoleId = '1372921679692431382'; // <<<<<< FILL THIS IN with the ID of the role that can use this command

            if (!interaction.member.roles.cache.has(requiredRoleId)) {
                await interaction.editReply('이 명령어는 특정 권한을 가진 사용자만 사용할 수 있습니다.');
                return;
            }

            let connection;
            try {
                connection = await mysql.createConnection({
                    host: '127.0.0.1',
                    user: 'root',
                    password: '',
                    database: 'vrpfx',
                });

                const [reservationCountRows] = await connection.execute('SELECT COUNT(*) AS count FROM bot_data;');
                const reservationCount = reservationCountRows[0].count;

                // Fetch the main reservation message and update it
                const updateChannel = client.channels.cache.get('1375834752493551778'); // Your provided channel ID
                if (updateChannel) {
                    try {
                        const updateMessage = await updateChannel.messages.fetch('1376019564743102494'); // Your provided message ID
                        if (updateMessage) {
                            const updatedEmbed = new EmbedBuilder()
                                .setTitle('사전 예약')
                                .setDescription("**아래의 버튼을 눌러 사전 예약에 참여하세요.**\n\n- 오픈 후 파이브엠과 디스코드 연동 후 지정된 비콘에서 보상이 지급됩니다.\n- 해당 지급 방법 외 지급 방법은 없다는 점 참고바랍니다.")
                                .setColor('#0000FF')
                                .setFooter({ text: `${reservationCount}명이 테스트와 함께합니다 !`, iconURL: 'https://media.discordapp.net/attachments/1191348184107200593/1191348238758977656/Whale_RP.gif?ex=6833ad42&is=68325bc2&hm=062474ff8139199059bcaacd4ea42d058eae1f8e91ec76ec6bfda64a7fcd5892&=' });

                            await updateMessage.edit({ embeds: [updatedEmbed], components: [row] }); // Update the existing message, keeping the button
                            await interaction.editReply('✅ 사전 예약 인원이 갱신되었습니다!'); // Confirm to the user who ran the command
                        } else {
                            await interaction.editReply('❌ 업데이트할 사전 예약 메시지를 찾을 수 없습니다. ID를 확인해주세요.');
                        }
                    } catch (error) {
                        console.error('메시지 갱신 중 오류:', error);
                        await interaction.editReply('⚠️ 메시지 갱신 중 오류가 발생했습니다.');
                    }
                } else {
                    await interaction.editReply('❌ 사전 예약 채널을 찾을 수 없습니다. ID를 확인해주세요.');
                }
            } catch (error) {
                console.error(error);
                await interaction.editReply('⚠️ 사전 예약 정보를 가져오는 중 오류가 발생했습니다.');
            } finally {
                if (connection) await connection.end();
            }
        }
    }
});


client.login(config.token).catch(console.error);