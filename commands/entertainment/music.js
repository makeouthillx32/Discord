const { EmbedBuilder } = require('discord.js');
const { 
    AudioPlayerStatus, 
    createAudioPlayer, 
    createAudioResource, 
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus 
} = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

// Music queue system
const musicQueue = new Map();
const audioPlayers = new Map();

module.exports = {
    // This is a prefix command, not a slash command
    name: 'music',
    prefix: 'm!',
    description: '🎵 Music bot commands - m![song] [artist]',
    aliases: ['play', 'p'],
    
    async execute(message, args, { nodeId, redis, client }) {
        // Check if user is in a voice channel
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }

        // If no args, show help
        if (!args || args.length === 0) {
            const helpEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('🎵 Music Bot Commands')
                .setDescription('**How to use the music bot:**')
                .addFields(
                    { name: '🎵 Play Music', value: '`m![song name] [artist]`\n`m!Never Gonna Give You Up Rick Astley`', inline: false },
                    { name: '📋 Queue', value: '`m!queue` - Show music queue', inline: true },
                    { name: '⏭️ Skip', value: '`m!skip` - Skip current song', inline: true },
                    { name: '⏹️ Stop', value: '`m!stop` - Stop and leave', inline: true },
                    { name: '🎵 Now Playing', value: '`m!np` - Current song info', inline: true }
                )
                .setFooter({ text: `Node: ${nodeId}` })
                .setTimestamp();
            
            return message.reply({ embeds: [helpEmbed] });
        }

        // Handle special commands
        const command = args[0].toLowerCase();
        const guildId = message.guild.id;

        switch (command) {
            case 'queue':
            case 'q':
                return await handleQueue(message, guildId, nodeId);
            case 'skip':
            case 's':
                return await handleSkip(message, guildId, nodeId);
            case 'stop':
            case 'leave':
                return await handleStop(message, guildId, nodeId);
            case 'nowplaying':
            case 'np':
                return await handleNowPlaying(message, guildId, nodeId);
            default:
                // Everything else is a song search
                return await handlePlay(message, args, voiceChannel, nodeId, redis);
        }
    }
};

async function handlePlay(message, args, voiceChannel, nodeId, redis) {
    const guildId = message.guild.id;
    const searchQuery = args.join(' ');
    
    // React to show we're processing
    await message.react('🎵');

    try {
        // Search for the song
        const searchResults = await ytSearch(searchQuery);
        
        if (!searchResults.videos || searchResults.videos.length === 0) {
            await message.react('❌');
            return message.reply(`❌ No results found for: **${searchQuery}**`);
        }

        const video = searchResults.videos[0];
        
        // Validate video
        if (!ytdl.validateURL(video.url)) {
            await message.react('❌');
            return message.reply('❌ Invalid video URL found. Please try a different search.');
        }

        // Create song object
        const songData = {
            title: video.title,
            artist: video.author.name,
            url: video.url,
            duration: video.duration.timestamp,
            thumbnail: video.thumbnail,
            requestedBy: message.author.tag,
            requestedById: message.author.id,
            addedAt: Date.now(),
            nodeId: nodeId
        };

        // Get or create queue for this guild
        let queue = musicQueue.get(guildId);
        
        if (!queue) {
            queue = {
                songs: [],
                isPlaying: false,
                voiceChannel: voiceChannel,
                textChannel: message.channel,
                connection: null,
                player: null
            };
            musicQueue.set(guildId, queue);
        }

        // Add song to queue
        queue.songs.push(songData);

        // Store queue in Redis for coordination
        await redis.setex(`music:queue:${guildId}`, 3600, JSON.stringify({
            songs: queue.songs,
            isPlaying: queue.isPlaying,
            currentSong: queue.currentSong || null
        }));

        if (!queue.isPlaying) {
            // Start playing
            await playMusic(guildId, message);
        } else {
            // Song added to queue
            const queueEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('📋 Added to Queue')
                .setDescription(`**[${songData.title}](${songData.url})**`)
                .addFields(
                    { name: '🎤 Artist', value: songData.artist, inline: true },
                    { name: '⏱️ Duration', value: songData.duration, inline: true },
                    { name: '📍 Position', value: `${queue.songs.length}`, inline: true },
                    { name: '👤 Requested by', value: songData.requestedBy, inline: true },
                    { name: '🖥️ Node', value: nodeId, inline: true }
                )
                .setThumbnail(songData.thumbnail)
                .setTimestamp();

            await message.react('✅');
            await message.reply({ embeds: [queueEmbed] });
        }

    } catch (error) {
        console.error('Error in music play command:', error);
        await message.react('❌');
        await message.reply(`❌ Error playing music: ${error.message}`);
    }
}

async function playMusic(guildId, message) {
    const queue = musicQueue.get(guildId);
    if (!queue || queue.songs.length === 0) return;

    const song = queue.songs[0];
    
    try {
        // Join voice channel
        const connection = joinVoiceChannel({
            channelId: queue.voiceChannel.id,
            guildId: guildId,
            adapterCreator: queue.voiceChannel.guild.voiceAdapterCreator
        });

        queue.connection = connection;

        // Create audio player
        const player = createAudioPlayer();
        queue.player = player;
        audioPlayers.set(guildId, player);

        // Create audio stream
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        });

        const resource = createAudioResource(stream, {
            inlineVolume: true
        });

        // Set volume
        resource.volume.setVolume(0.3);

        // Play the song
        player.play(resource);
        connection.subscribe(player);
        
        queue.isPlaying = true;
        queue.currentSong = song;

        // Create now playing embed
        const nowPlayingEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('🎵 Now Playing')
            .setDescription(`**[${song.title}](${song.url})**`)
            .addFields(
                { name: '🎤 Artist', value: song.artist, inline: true },
                { name: '⏱️ Duration', value: song.duration, inline: true },
                { name: '📋 Queue', value: `${queue.songs.length} songs`, inline: true },
                { name: '👤 Requested by', value: song.requestedBy, inline: true },
                { name: '🖥️ Node', value: song.nodeId, inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setTimestamp()
            .setFooter({ text: `Playing in ${queue.voiceChannel.name}` });

        await message.react('✅');
        await message.reply({ embeds: [nowPlayingEmbed] });

        // Handle player events
        player.on(AudioPlayerStatus.Idle, () => {
            // Song finished, play next
            queue.songs.shift(); // Remove current song
            
            if (queue.songs.length > 0) {
                // Play next song
                playMusic(guildId, message);
            } else {
                // Queue empty, stop
                queue.isPlaying = false;
                queue.currentSong = null;
                connection.destroy();
                musicQueue.delete(guildId);
                audioPlayers.delete(guildId);
                
                queue.textChannel.send('🎵 Queue finished! Leaving voice channel.');
            }
        });

        player.on('error', error => {
            console.error('Audio player error:', error);
            queue.textChannel.send(`❌ Audio player error: ${error.message}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            connection.destroy();
            musicQueue.delete(guildId);
            audioPlayers.delete(guildId);
        });

    } catch (error) {
        console.error('Error playing music:', error);
        await message.react('❌');
        await message.reply(`❌ Error playing music: ${error.message}`);
        
        queue.isPlaying = false;
        musicQueue.delete(guildId);
    }
}

async function handleQueue(message, guildId, nodeId) {
    const queue = musicQueue.get(guildId);
    
    if (!queue || queue.songs.length === 0) {
        return message.reply('📋 The music queue is empty!');
    }

    const currentSong = queue.currentSong;
    const upcomingSongs = queue.songs.slice(1, 11); // Show next 10 songs
    
    const queueEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📋 Music Queue')
        .setTimestamp()
        .setFooter({ text: `Node: ${nodeId}` });

    if (currentSong) {
        queueEmbed.addFields({
            name: '🎵 Now Playing',
            value: `**[${currentSong.title}](${currentSong.url})**\n🎤 ${currentSong.artist} | ⏱️ ${currentSong.duration}`
        });
    }

    if (upcomingSongs.length > 0) {
        const queueList = upcomingSongs.map((song, index) => 
            `**${index + 1}.** [${song.title}](${song.url})\n🎤 ${song.artist} | ⏱️ ${song.duration}`
        ).join('\n\n');

        queueEmbed.addFields({
            name: `⏭️ Up Next (${queue.songs.length - 1} total)`,
            value: queueList.length > 1024 ? queueList.substring(0, 1021) + '...' : queueList
        });
    }

    await message.reply({ embeds: [queueEmbed] });
}

async function handleSkip(message, guildId, nodeId) {
    const queue = musicQueue.get(guildId);
    const player = audioPlayers.get(guildId);
    
    if (!queue || !queue.isPlaying || !player) {
        return message.reply('❌ Nothing is currently playing!');
    }

    player.stop(); // This will trigger the Idle event and play next song
    
    await message.react('⏭️');
    await message.reply(`⏭️ **Skipped!** Playing next song... | Node: \`${nodeId}\``);
}

async function handleStop(message, guildId, nodeId) {
    const queue = musicQueue.get(guildId);
    const player = audioPlayers.get(guildId);
    
    if (!queue) {
        return message.reply('❌ Nothing is currently playing!');
    }

    // Stop player and clear queue
    if (player) {
        player.stop();
    }
    
    if (queue.connection) {
        queue.connection.destroy();
    }
    
    musicQueue.delete(guildId);
    audioPlayers.delete(guildId);
    
    await message.react('⏹️');
    await message.reply(`⏹️ **Stopped music and cleared queue!** | Node: \`${nodeId}\``);
}

async function handleNowPlaying(message, guildId, nodeId) {
    const queue = musicQueue.get(guildId);
    
    if (!queue || !queue.isPlaying || !queue.currentSong) {
        return message.reply('❌ Nothing is currently playing!');
    }

    const song = queue.currentSong;
    
    const nowPlayingEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🎵 Currently Playing')
        .setDescription(`**[${song.title}](${song.url})**`)
        .addFields(
            { name: '🎤 Artist', value: song.artist, inline: true },
            { name: '⏱️ Duration', value: song.duration, inline: true },
            { name: '📋 Queue Length', value: `${queue.songs.length} songs`, inline: true },
            { name: '👤 Requested by', value: song.requestedBy, inline: true },
            { name: '🖥️ Node', value: nodeId, inline: true },
            { name: '📅 Added', value: `<t:${Math.floor(song.addedAt / 1000)}:R>`, inline: true }
        )
        .setThumbnail(song.thumbnail)
        .setTimestamp();

    await message.reply({ embeds: [nowPlayingEmbed] });
}