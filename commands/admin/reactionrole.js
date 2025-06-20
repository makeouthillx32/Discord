const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Import all component handlers
const { handleAutocomplete } = require('./components/reactionrole-autocomplete');
const { handleCreate } = require('./components/reactionrole-create');
const { handleAdd } = require('./components/reactionrole-add');
const { handleRemove } = require('./components/reactionrole-remove');
const { handleList } = require('./components/reactionrole-list');
const { handleEdit } = require('./components/reactionrole-edit');
const { handleEmojiList } = require('./components/reactionrole-emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage reaction role systems')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new reaction role message')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Title for the reaction role embed')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description for the reaction role embed')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to send the reaction role message')
            .setRequired(false)
        )
        .addStringOption(option =>
          option.setName('color')
            .setDescription('Embed color (hex code like #FF0000)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a reaction role to an existing message')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('ID of the message to add reaction role to')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('Emoji for the reaction (use emoji or :name:)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to assign when reacted')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description for this reaction role')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a reaction role from a message')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('ID of the message')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('Emoji to remove')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all reaction roles in this server')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Filter by specific channel')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit an existing reaction role message')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('ID of the message to edit')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('title')
            .setDescription('New title')
            .setRequired(false)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('New description')
            .setRequired(false)
        )
        .addStringOption(option =>
          option.setName('color')
            .setDescription('New color (hex code)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('emojis')
        .setDescription('List all available server emojis for reaction roles')
    ),

  async execute(interaction, { nodeId, database, client }) {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      return await handleAutocomplete(interaction);
    }

    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return await interaction.reply({
        content: '❌ You need the "Manage Roles" permission to use this command!',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'create':
          await handleCreate(interaction, database, nodeId);
          break;
        case 'add':
          await handleAdd(interaction, database, client, nodeId);
          break;
        case 'remove':
          await handleRemove(interaction, database, client, nodeId);
          break;
        case 'list':
          await handleList(interaction, database, nodeId);
          break;
        case 'edit':
          await handleEdit(interaction, database, client, nodeId);
          break;
        case 'emojis':
          await handleEmojiList(interaction, nodeId);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown subcommand!',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Error in reactionrole command:', error);
      const errorReply = {
        content: `❌ Error: ${error.message}\nNode: \`${nodeId}\``,
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