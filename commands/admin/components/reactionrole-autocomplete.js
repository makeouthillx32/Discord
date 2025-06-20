// commands/admin/components/reactionrole-autocomplete.js

async function handleAutocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'emoji') {
        const guild = interaction.guild;
        const choices = [];
        
        // Add common Unicode emojis first (more reliable)
        const commonEmojis = [
          { name: '👍 Thumbs Up', value: '👍' },
          { name: '❤️ Red Heart', value: '❤️' },
          { name: '😀 Grinning Face', value: '😀' },
          { name: '🎉 Party Popper', value: '🎉' },
          { name: '✅ Check Mark Button', value: '✅' },
          { name: '❌ Cross Mark', value: '❌' },
          { name: '🎮 Video Game', value: '🎮' },
          { name: '🎵 Musical Note', value: '🎵' },
          { name: '🎨 Artist Palette', value: '🎨' },
          { name: '📚 Books', value: '📚' },
          { name: '💻 Laptop Computer', value: '💻' },
          { name: '🏆 Trophy', value: '🏆' },
          { name: '⚡ High Voltage', value: '⚡' },
          { name: '🔥 Fire', value: '🔥' },
          { name: '💎 Gem Stone', value: '💎' },
          { name: '🌟 Glowing Star', value: '🌟' },
          { name: '🎯 Direct Hit', value: '🎯' },
          { name: '🚀 Rocket', value: '🚀' },
          { name: '🎪 Circus Tent', value: '🎪' },
          { name: '🎭 Performing Arts', value: '🎭' }
        ];
        
        // Add Unicode emojis to choices first
        commonEmojis.forEach(emoji => choices.push(emoji));
        
        try {
          // Try to add server custom emojis (but don't let this fail the whole function)
          if (guild && guild.emojis && guild.emojis.cache) {
            // Use cached emojis only, don't fetch to avoid timeouts
            guild.emojis.cache.forEach(emoji => {
              if (emoji.available && choices.length < 20) { // Leave room for Unicode emojis
                const displayName = `${emoji.animated ? '🎬' : '🖼️'} ${emoji.name}`;
                const emojiValue = emoji.toString(); // This gives us <:name:id> or <a:name:id>
                
                choices.push({
                  name: displayName,
                  value: emojiValue
                });
              }
            });
          }
        } catch (emojiError) {
          console.error('Error adding server emojis to autocomplete:', emojiError);
          // Continue with just Unicode emojis
        }
        
        // Filter based on user input (case insensitive)
        const userInput = focusedOption.value.toLowerCase();
        let filtered = choices;
        
        if (userInput.length > 0) {
          filtered = choices.filter(choice => 
            choice.name.toLowerCase().includes(userInput) ||
            choice.value.toLowerCase().includes(userInput)
          );
        }
        
        // Limit to Discord's 25 option maximum
        filtered = filtered.slice(0, 25);
        
        // Ensure we always have at least some options
        if (filtered.length === 0) {
          filtered = [
            { name: '👍 Thumbs Up', value: '👍' },
            { name: '❤️ Red Heart', value: '❤️' },
            { name: '✅ Check Mark', value: '✅' },
            { name: '❌ Cross Mark', value: '❌' },
            { name: '🎉 Party Popper', value: '🎉' }
          ];
        }
        
        await interaction.respond(filtered);
        
      } else {
        // For any other option, return empty array
        await interaction.respond([]);
      }
      
    } catch (error) {
      console.error('Critical error in autocomplete handler:', error);
      
      // Emergency fallback - always respond with something
      try {
        await interaction.respond([
          { name: '👍 Thumbs Up', value: '👍' },
          { name: '❤️ Red Heart', value: '❤️' },
          { name: '✅ Check Mark', value: '✅' },
          { name: '❌ Cross Mark', value: '❌' },
          { name: '🎉 Party Popper', value: '🎉' }
        ]);
      } catch (fallbackError) {
        console.error('Even fallback autocomplete failed:', fallbackError);
      }
    }
  }
  
  module.exports = { handleAutocomplete };