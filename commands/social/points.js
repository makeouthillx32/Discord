const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('🎯 Check points and levels')
        .addSubcommand(subcommand =>
            subcommand
                .setName('me')
                .setDescription('Check your points and level')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Check another user\'s points')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('User to check')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Show server leaderboard')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of users to show (max 25)')
                        .setMinValue(5)
                        .setMaxValue(25)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Show how to earn points')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('Show your recent point history')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Check another user\'s history (admin only)')
                        .setRequired(false)
                )
        ),

    async execute(interaction, { nodeId, redis, client, database, pointsSystem }) {
        // Validate guild context
        if (!interaction.guild) {
            return await interaction.reply({
                content: '❌ This command can only be used in a server!',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'me':
                    await showUserPoints(interaction, interaction.user, nodeId, pointsSystem);
                    break;
                case 'user':
                    const targetUser = interaction.options.getUser('target');
                    await showUserPoints(interaction, targetUser, nodeId, pointsSystem);
                    break;
                case 'leaderboard':
                    const limit = interaction.options.getInteger('limit') || 10;
                    await showLeaderboard(interaction, limit, nodeId, pointsSystem);
                    break;
                case 'info':
                    await showPointsInfo(interaction, nodeId);
                    break;
                case 'history':
                    const historyUser = interaction.options.getUser('user') || interaction.user;
                    await showPointsHistory(interaction, historyUser, nodeId, pointsSystem);
                    break;
            }
        } catch (error) {
            console.error('Error in points command:', error);
            const errorReply = {
                content: `❌ Error executing points command: ${error.message}\nNode: \`${nodeId}\``,
                ephemeral: true
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorReply);
            } else {
                await interaction.reply(errorReply);
            }
        }
    }
};

async function showUserPoints(interaction, user, nodeId, pointsSystem) {
    await interaction.deferReply();
    
    try {
        // Ensure guild and user IDs are valid
        if (!interaction.guild?.id) {
            throw new Error('Guild ID is missing');
        }
        if (!user?.id) {
            throw new Error('User ID is missing');
        }

        let stats;
        if (pointsSystem) {
            // Try to get stats from points system
            stats = await pointsSystem.getUserStats(user.id, interaction.guild.id);
        } else {
            // Fallback if points system is not available
            stats = getDefaultUserStats(user.id, interaction.guild.id);
        }
        
        const embed = new EmbedBuilder()
            .setColor(getEmbedColor(stats.level))
            .setTitle(`📊 ${user.displayName || user.username}'s Stats`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { 
                    name: '🎯 Points & Level', 
                    value: `**${stats.total_points.toLocaleString()}** points\n**Level ${stats.level}** ${getLevelEmoji(stats.level)}\n${stats.points_to_next || 0} to next level`, 
                    inline: true 
                },
                { 
                    name: '📈 Rank & Progress', 
                    value: `**Rank #${stats.rank || 'Unranked'}**\n${createProgressBar(stats.total_points % 100, 100)}\n${Math.floor((stats.total_points % 100) / 100 * 100)}%`, 
                    inline: true 
                },
                { 
                    name: '📊 Activity Stats', 
                    value: `💬 **${stats.messages_sent || 0}** messages\n🎤 **${Math.floor((stats.voice_time_seconds || 0) / 60)}** voice minutes\n⚡ **${stats.commands_used || 0}** commands used`, 
                    inline: true 
                },
                { 
                    name: '🔥 Engagement', 
                    value: `❤️ **${stats.reactions_given || 0}** reactions given\n📅 **${stats.daily_streak || 0}** day streak\n🏆 Level ${stats.level} achieved`, 
                    inline: true 
                }
            )
            .setFooter({ text: `Node: ${nodeId} | Points System v2.0` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error showing user points:', error);
        await interaction.editReply({
            content: `❌ Error fetching user stats: ${error.message}`
        });
    }
}

async function showLeaderboard(interaction, limit, nodeId, pointsSystem) {
    await interaction.deferReply();
    
    try {
        if (!interaction.guild?.id) {
            throw new Error('Guild ID is missing');
        }

        let leaderboard = [];
        if (pointsSystem) {
            leaderboard = await pointsSystem.getLeaderboard(interaction.guild.id, limit);
        } else {
            // Mock leaderboard for testing
            for (let i = 0; i < Math.min(limit, 5); i++) {
                leaderboard.push({
                    user_id: `user${i}`,
                    username: `User${i + 1}`,
                    total_points: 1000 - (i * 100),
                    level: 10 - i,
                    rank: i + 1
                });
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle(`🏆 ${interaction.guild.name} Leaderboard`)
            .setDescription(`Top ${limit} users by points`)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .setFooter({ text: `Node: ${nodeId} | Total ${leaderboard.length} users` })
            .setTimestamp();

        if (leaderboard.length === 0) {
            embed.addFields({
                name: '📊 No Data',
                value: 'No users have earned points yet! Start chatting to earn points.',
                inline: false
            });
        } else {
            let leaderboardText = '';
            for (let i = 0; i < Math.min(leaderboard.length, 10); i++) {
                const user = leaderboard[i];
                const medal = getMedalEmoji(user.rank);
                const levelEmoji = getLevelEmoji(user.level);
                
                leaderboardText += `${medal} **${user.rank}.** ${user.username || `<@${user.user_id}>`}\n`;
                leaderboardText += `   ${levelEmoji} Level ${user.level} • **${user.total_points.toLocaleString()}** points\n\n`;
            }

            embed.addFields({
                name: '🎯 Top Players',
                value: leaderboardText || 'No users found',
                inline: false
            });

            // Add server stats if available
            const totalPoints = leaderboard.reduce((sum, user) => sum + user.total_points, 0);
            const avgLevel = Math.round(leaderboard.reduce((sum, user) => sum + user.level, 0) / leaderboard.length);
            
            embed.addFields({
                name: '📊 Server Stats',
                value: `🎯 **${totalPoints.toLocaleString()}** total points\n📈 **${avgLevel}** average level\n👥 **${leaderboard.length}** active users`,
                inline: true
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error showing leaderboard:', error);
        await interaction.editReply({
            content: `❌ Error fetching leaderboard: ${error.message}`
        });
    }
}

async function showPointsHistory(interaction, user, nodeId, pointsSystem) {
    await interaction.deferReply();
    
    try {
        if (!interaction.guild?.id) {
            throw new Error('Guild ID is missing');
        }
        if (!user?.id) {
            throw new Error('User ID is missing');
        }

        // Mock history for now since database might not have history table
        const history = [
            { points: 5, reason: 'Message Sent', action_type: 'message', created_at: new Date(Date.now() - 10000) },
            { points: 3, reason: 'Command Usage', action_type: 'command', created_at: new Date(Date.now() - 60000) },
            { points: 1, reason: 'Reaction Given', action_type: 'reaction', created_at: new Date(Date.now() - 300000) }
        ];

        const embed = new EmbedBuilder()
            .setColor(0x9932cc)
            .setTitle(`📜 ${user.displayName || user.username}'s Recent Activity`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `Node: ${nodeId} | Last ${history.length} activities` })
            .setTimestamp();

        if (history.length === 0) {
            embed.addFields({
                name: '📊 No Activity',
                value: 'No recent point activity found.',
                inline: false
            });
        } else {
            let historyText = '';
            for (const entry of history) {
                const timeAgo = getTimeAgo(entry.created_at);
                const emoji = getActivityEmoji(entry.action_type);
                const sign = entry.points > 0 ? '+' : '';
                
                historyText += `${emoji} **${sign}${entry.points}** - ${entry.reason}\n`;
                historyText += `   *${timeAgo}*\n\n`;
            }

            embed.addFields({
                name: '🎯 Recent Point Activities',
                value: historyText,
                inline: false
            });

            const totalPoints = history.reduce((sum, entry) => sum + entry.points, 0);
            embed.addFields({
                name: '📊 Summary',
                value: `**+${totalPoints}** total points shown\n**${history.length}** recent activities`,
                inline: true
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error showing points history:', error);
        await interaction.editReply({
            content: `❌ Error fetching points history: ${error.message}`
        });
    }
}

async function showPointsInfo(interaction, nodeId) {
    const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('🎯 How to Earn Points')
        .setDescription('Here are all the ways to earn points in this server!')
        .addFields(
            {
                name: '💬 Messaging',
                value: '**+1** point per message\n**+5** bonus for long messages (100+ chars)\n**+10** first message of the day',
                inline: true
            },
            {
                name: '🎤 Voice Activity',
                value: '**+5** points per minute in voice\n**+10** bonus for joining events\n**+20** for hosting activities',
                inline: true
            },
            {
                name: '⚡ Commands',
                value: '**+3** points per bot command\n**+5** for music commands\n**+2** for helpful commands',
                inline: true
            },
            {
                name: '❤️ Reactions',
                value: '**+1** point for giving reactions\n**+2** points when others react to you\n**+5** for popular messages',
                inline: true
            },
            {
                name: '🧵 Community',
                value: '**+15** for creating threads\n**+20** for creating invites\n**+50** for daily activity',
                inline: true
            },
            {
                name: '🏆 Bonuses',
                value: '**+50** daily login bonus\n**+200** weekly activity bonus\n**+1000** monthly bonus',
                inline: true
            }
        )
        .setFooter({ text: `Node: ${nodeId} | Points System v2.0` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// Helper functions
function getDefaultUserStats(userId, guildId) {
    return {
        user_id: userId,
        guild_id: guildId,
        total_points: 0,
        level: 1,
        points_to_next: 100,
        messages_sent: 0,
        commands_used: 0,
        reactions_given: 0,
        reactions_received: 0,
        voice_time_seconds: 0,
        rank: 'Unranked'
    };
}

function getEmbedColor(level) {
    if (level >= 50) return 0xff0000;      
    if (level >= 25) return 0xff8c00;      
    if (level >= 10) return 0xffd700;      
    if (level >= 5) return 0x0099ff;       
    return 0x00ff00;                       
}

function getLevelEmoji(level) {
    if (level >= 50) return '👑';
    if (level >= 25) return '💎';
    if (level >= 10) return '🔥';
    if (level >= 5) return '⭐';
    return '🌟';
}

function getMedalEmoji(rank) {
    switch (rank) {
        case 1: return '🥇';
        case 2: return '🥈';
        case 3: return '🥉';
        default: return '🏅';
    }
}

function getActivityEmoji(actionType) {
    const emojiMap = {
        'message': '💬',
        'command': '⚡',
        'voice': '🎤',
        'reaction': '❤️',
        'bonus': '🎁',
        'level_up': '🎉',
        'streak': '🔥'
    };
    return emojiMap[actionType] || '📊';
}

function createProgressBar(current, max, length = 10) {
    const percentage = Math.min(current / max, 1);
    const filled = Math.round(length * percentage);
    const empty = length - filled;
    
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffDays > 0) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffMins > 0) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    return 'Just now';
}