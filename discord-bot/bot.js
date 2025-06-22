const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// Discord bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Configuration
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:2000';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-here';
const TRIGGER_MENTION = process.env.TRIGGER_MENTION || 'UKSimRacingWebsite';

// Function to check if user has permission to post to website
async function checkUserPostPermission(userId, member) {
    try {
        // Get user's roles in the server
        const userRoles = member ? member.roles.cache.map(role => role.id) : [];
        
        if (userRoles.length === 0) {
            console.log(`User ${userId} has no roles`);
            return false;
        }
        
        console.log(`Checking permissions for user ${userId} with roles:`, userRoles);
        
        // Query website API to check if any of the user's roles are approved for bot mentions
        const response = await axios.get(`${WEBSITE_URL}/api/discord/bot-mention-permissions`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': WEBHOOK_SECRET
            },
            timeout: 5000
        });
        
        if (response.status !== 200) {
            console.log('Failed to get bot mention permissions from website');
            return false;
        }
        
        const approvedRoles = response.data || [];
        console.log(`Found ${approvedRoles.length} approved roles from website:`, approvedRoles.map(r => r.role_name));
        
        // Check if user has any approved roles
        const hasApprovedRole = userRoles.some(userRole => 
            approvedRoles.some(approvedRole => approvedRole.role_id === userRole)
        );
        
        console.log(`User has approved role: ${hasApprovedRole}`);
        return hasApprovedRole;
        
    } catch (error) {
        console.error('Error checking user post permission:', error.message);
        // On error, deny permission for security
        return false;
    }
}

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Discord bot logged in as ${client.user.tag}!`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`🔍 Monitoring for mentions of: @${TRIGGER_MENTION}`);
    console.log(`🌐 Posting to website: ${WEBSITE_URL}/webhook/discord`);
    console.log(`📊 Connected to ${client.guilds.cache.size} servers:`);
    client.guilds.cache.forEach(guild => {
        console.log(`  - ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
    });
    
    // Send initial member count to website
    updateMemberCount();
    
    // Update member count every hour
    setInterval(updateMemberCount, 60 * 60 * 1000);
});

// Function to update member count on website
async function updateMemberCount() {
    try {
        const guild = client.guilds.cache.first(); // Get the first (main) guild
        if (!guild) return;
        
        // Use cached member count (no need to fetch all members)
        const memberCount = guild.memberCount;
        
        console.log(`📊 Updating member count: ${memberCount}`);
        
        // Send to website
        await axios.post(`${WEBSITE_URL}/api/stats`, {
            memberCount: memberCount
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': WEBHOOK_SECRET
            },
            timeout: 10000 // 10 second timeout
        });
        
        console.log(`✅ Successfully updated website with member count: ${memberCount}`);
        
    } catch (error) {
        console.error('❌ Error updating member count:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Message handler
client.on('messageCreate', async (message) => {
    try {
        console.log(`📝 Message received from ${message.author.username}: "${message.content.substring(0, 50)}..."`);
        
        // Skip bot messages
        if (message.author.bot) {
            console.log('⏭️ Skipping bot message');
            return;
        }
        
        // Check if message mentions UKSimRacingWebsite
        const mentionedUsers = message.mentions.users;
        const mentionedRoles = message.mentions.roles;
        const messageContent = message.content.toLowerCase();
        
        // Check for @UKSimRacingWebsite mention (user, role, or text)
        const isTriggered = 
            mentionedUsers.some(user => user.username.toLowerCase().includes(TRIGGER_MENTION.toLowerCase())) ||
            mentionedRoles.some(role => role.name.toLowerCase().includes(TRIGGER_MENTION.toLowerCase())) ||
            messageContent.includes(`@${TRIGGER_MENTION.toLowerCase()}`) ||
            messageContent.includes('#news') ||
            messageContent.includes('#website');

        if (!isTriggered) return;

        console.log(`📢 Triggered message found from ${message.author.username} in #${message.channel.name}`);
        
        // Check if user has permission to post to website
        const hasPostPermission = await checkUserPostPermission(message.author.id, message.member);
        if (!hasPostPermission) {
            console.log(`🚫 User ${message.author.username} does not have permission to post to website`);
            // React with X to indicate no permission
            try {
                await message.react('❌');
            } catch (error) {
                console.log('Could not react to message:', error.message);
            }
            return;
        }
        
        console.log(`✅ User ${message.author.username} has permission to post to website`);
        
        // Clean the message content (remove Discord mentions and tags)
        let cleanContent = message.content
            .replace(new RegExp(`@${TRIGGER_MENTION}`, 'gi'), '')
            .replace(/#news/gi, '')
            .replace(/#website/gi, '')
            .replace(/<@&?\d+>/g, '') // Remove all Discord user/role mentions
            .replace(/<#\d+>/g, '') // Remove channel mentions
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();

        // If content is too short, skip
        if (cleanContent.length < 10) {
            console.log('⚠️ Message too short, skipping...');
            return;
        }

        // Process attachments
        const attachments = message.attachments.map(attachment => ({
            url: attachment.url,
            filename: attachment.name,
            size: attachment.size
        }));
        
        console.log(`📎 Found ${attachments.length} attachments:`, attachments);

        // Get user's nickname (display name) in the guild, fallback to username
        const member = message.guild.members.cache.get(message.author.id);
        const displayName = member ? (member.nickname || member.user.displayName || member.user.username) : message.author.username;
        
        // Format the author with channel info and post date
        const postDate = message.createdAt.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
        const authorDisplay = `${displayName} in #${message.channel.name} on ${postDate}`;
        
        // Prepare webhook payload
        const payload = {
            content: cleanContent,
            author: authorDisplay,
            message_id: message.id,
            channel: message.channel.name,
            timestamp: message.createdAt.toISOString(),
            attachments: attachments
        };

        // Send to website
        await sendToWebsite(payload);
        
        // React to the message to confirm processing
        await message.react('✅');
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
        try {
            await message.react('❌');
        } catch (reactError) {
            console.error('Failed to react to message:', reactError);
        }
    }
});

// Send payload to website
async function sendToWebsite(payload) {
    try {
        const response = await axios.post(`${WEBSITE_URL}/webhook/discord`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': WEBHOOK_SECRET
            },
            timeout: 10000 // 10 second timeout
        });

        if (response.status === 200) {
            console.log(`✅ Successfully posted news: "${payload.content.substring(0, 50)}..."`);
        } else {
            console.error(`⚠️ Unexpected response status: ${response.status}`);
        }
        
    } catch (error) {
        if (error.response) {
            console.error(`❌ Website responded with error: ${error.response.status} - ${error.response.data?.error || 'Unknown error'}`);
        } else if (error.request) {
            console.error('❌ Could not reach website - check if it\'s running on', WEBSITE_URL);
        } else {
            console.error('❌ Error sending to website:', error.message);
        }
        throw error;
    }
}

// Error handling
client.on('error', error => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN)
    .catch(error => {
        console.error('❌ Failed to login to Discord:', error);
        process.exit(1);
    });