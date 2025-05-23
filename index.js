const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const app = express();
const PORT = 3000;
require('dotenv').config();

// เพิ่มในส่วนต้นของไฟล์ หลัง require statements


app.get('/', (req, res) => {
    res.json({
        status: 'online',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        bot_status: client.user ? 'connected' : 'disconnected',
        guilds_count: client.guilds ? client.guilds.cache.size : 0
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date() });
});
// Configuration from environment variables
const CONFIG = {
    user_token: process.env.DISCORD_USER_TOKEN,
    source_channels: {
        egg_notifications: process.env.SOURCE_EGG_CHANNEL_ID,
        weather_notifications: process.env.SOURCE_WEATHER_CHANNEL_ID
    },
    webhook_urls: {
        egg_notifications: process.env.WEBHOOK_EGG_URL,
        weather_notifications: process.env.WEBHOOK_WEATHER_URL
    },
    check_interval: parseInt(process.env.CHECK_INTERVAL) || 30000, // 30 seconds
    prefix: process.env.COMMAND_PREFIX || "!"
};

// Create Discord client for reading messages only
const client = new Client({
    checkUpdate: false,
    syncStatus: false,
    autoRedeemNitro: false
});

// Storage for last processed message IDs
let lastMessageIds = {
    egg_notifications: null,
    weather_notifications: null
};

// Data file path
const DATA_FILE = path.join(__dirname, 'selfbot_data.json');

class WebhookRelay {
    getWeatherConfig() {
        return {
            'raining': {
                name: 'Raining',
                emoji: '🌧️',
                color: 0x4A90E2,
                thumbnail: 'https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png'
            },
            'thunder': {
                name: 'Thunder',
                emoji: '⛈️',
                color: 0x6C5CE7,
                thumbnail: 'https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png'
            },
            'snow': {
                name: 'Snow',
                emoji: '❄️',
                color: 0x74B9FF,
                thumbnail: 'https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png'
            },
            'night': {
                name: 'Night',
                emoji: '🌙',
                color: 0x2D3436,
                thumbnail: 'https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png'
            },
            'blood moon': {
                name: 'Blood Moon',
                emoji: '🩸🌕',
                color: 0xD63031,
                thumbnail: 'https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png'
            },
            'meteor shower': {
                name: 'Meteor Shower',
                emoji: '☄️',
                color: 0xFDCB6E,
                thumbnail: 'https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png'
            }
        };
    }
    constructor() {
        this.loadData();
    }

    // Load saved data
    loadData() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                lastMessageIds = data.lastMessageIds || lastMessageIds;
                console.log('📂 Loaded previous data');
            }
        } catch (error) {
            console.error('❌ Error loading data:', error);
        }
    }

    // Save data
    saveData() {
        try {
            const data = {
                lastMessageIds,
                lastUpdate: new Date().toISOString()
            };
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Error saving data:', error);
        }
    }

    // Extract content from message (text or embed)
    extractMessageContent(message) {
        let content = '';
        
        // First, check if message has regular text content
        if (message.content && message.content.trim()) {
            content = message.content.trim();
        }
        
        // Also extract from embeds (even if text content exists)
        if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0];
            let embedContent = '';
            
            // Extract all embed content
            if (embed.title) {
                embedContent += `**${embed.title}**\n`;
            }
            
            if (embed.description) {
                embedContent += `${embed.description}\n`;
            }
            
            if (embed.fields && embed.fields.length > 0) {
                embedContent += embed.fields.map(field => `**${field.name}**: ${field.value}`).join('\n');
            }
            
            // If we have embed content, use it (with or without text content)
            if (embedContent.trim()) {
                content = content ? `${content}\n\n${embedContent}` : embedContent.trim();
            }
        }

        
        
        
        return content || 'ไม่พบเนื้อหาข้อความ';
    
    
    }

// Parse and filter weather data from content
parseWeatherData(content) {
    console.log('\n🌤️ === WEATHER PARSING DEBUG START ===');
    console.log(`📝 Raw content: "${content}"`);
    console.log(`📄 Content length: ${content.length} characters`);
    
    const weatherConfig = this.getWeatherConfig();
    const validWeatherTypes = Object.keys(weatherConfig);
    const foundWeathers = [];
    
    // Split content into lines and process each line
    const lines = content.split('\n');
    console.log(`📋 Total lines: ${lines.length}`);
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        console.log(`\n--- LINE ${i} ---`);
        console.log(`Raw: "${lines[i]}"`);
        console.log(`Trimmed: "${line}"`);
        
        if (!line) {
            console.log(`❌ Empty line, skipping`);
            continue;
        }
        
        // Skip role mentions and other Discord formatting
        if (line.startsWith('<@&') || line.startsWith('**') && line.endsWith('**') && line.length < 20) {
            console.log(`⏭️ Skipping Discord formatting/mention`);
            continue;
        }
        
        // Clean the line from Discord formatting
        let cleanLine = line
            .replace(/<:[^:]+:\d+>/g, '') // Remove custom emojis
            .replace(/\*+/g, '') // Remove markdown bold
            .replace(/<@&\d+>/g, '') // Remove role mentions
            .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .toLowerCase();
        
        console.log(`Cleaned line: "${cleanLine}"`);
        
        // Check for valid weather types
        for (const weatherType of validWeatherTypes) {
            if (cleanLine.includes(weatherType.toLowerCase())) {
                console.log(`✅ Found weather type: ${weatherType}`);
                
                // Extract additional context if available
                let weatherInfo = {
                    type: weatherType,
                    originalLine: line,
                    cleanLine: cleanLine
                };
                
                // Look for time information or additional details
                const timeMatch = line.match(/(\d{1,2}:\d{2}|\d{1,2}h|\d+\s*(hours?|hrs?|minutes?|mins?))/i);
                if (timeMatch) {
                    weatherInfo.timeInfo = timeMatch[0];
                    console.log(`🕐 Found time info: ${weatherInfo.timeInfo}`);
                }
                
                foundWeathers.push(weatherInfo);
                break; // Only match one weather type per line
            }
        }
    }
    
    console.log('\n🎯 === WEATHER PARSING RESULTS ===');
    console.log(`Total weather events found: ${foundWeathers.length}`);
    foundWeathers.forEach((weather, index) => {
        console.log(`${index + 1}. ${weather.type} ${weather.timeInfo ? `(${weather.timeInfo})` : ''}`);
    });
    console.log('=== WEATHER PARSING DEBUG END ===\n');
    
    return foundWeathers;
}

// Create custom embed for weather notifications
createWeatherEmbed(weatherData, originalContent) {
    if (!weatherData || weatherData.length === 0) {
        console.log('❌ No weather data to create embed');
        return null;
    }

    const weatherConfig = this.getWeatherConfig();
    let description = '';
    let embedColor = 0x74B9FF; // Default blue color
    let thumbnailUrl = 'https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png';
    
    // Process each weather event
    for (const weather of weatherData) {
        const config = weatherConfig[weather.type];
        if (config) {
            description += `${config.emoji} **${config.name}**`;
            if (weather.timeInfo) {
                description += ` - ${weather.timeInfo}`;
            }
            description += '\n';
            
            // Use the color of the first weather type found
            if (weatherData.indexOf(weather) === 0) {
                embedColor = config.color;
            }
        }
    }
    
    // If no valid weather found, return null
    if (!description.trim()) {
        console.log('❌ No valid weather descriptions created');
        return null;
    }
    
    const embed = {
        author: {
            name: 'Weather Update 🌤️',
            icon_url: "https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png"
        },
        title: 'Current Weather Status',
        description: description.trim(),
        color: embedColor,
        thumbnail: {
            url: thumbnailUrl
        },
        footer: {
            text: `Weather Alert • ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`
        },
        timestamp: new Date().toISOString()
    };
    
    console.log(`✅ Created weather embed with ${weatherData.length} weather event(s)`);
    return embed;
}

// Check if content contains valid weather information
isValidWeatherContent(content) {
    const weatherConfig = this.getWeatherConfig();
    const validWeatherTypes = Object.keys(weatherConfig);
    const contentLower = content.toLowerCase();
    
    // Check if content contains any valid weather types
    for (const weatherType of validWeatherTypes) {
        if (contentLower.includes(weatherType.toLowerCase())) {
            console.log(`✅ Content contains valid weather type: ${weatherType}`);
            return true;
        }
    }
    
    console.log(`❌ Content does not contain valid weather types`);
    console.log(`📝 Checked content: "${content.substring(0, 100)}..."`);
    return false;
}
    // Parse egg data from message content - FIXED VERSION
    // Fixed parseEggData function
parseEggData(content) {
    const eggData = [];
    const lines = content.split('\n');
    
    console.log('\n🔍 === EGG PARSING DEBUG START ===');
    console.log(`📝 Total lines: ${lines.length}`);
    console.log(`📄 Raw content: "${content}"`);
    console.log('📋 Processing each line:');
    
    for (let i = 0; i < lines.length; i++) {
        let cleanLine = lines[i].trim();
        
        console.log(`\n--- LINE ${i} ---`);
        console.log(`Raw: "${lines[i]}"`);
        console.log(`Trimmed: "${cleanLine}"`);
        console.log(`Length: ${cleanLine.length}`);
        console.log(`Has 'egg': ${cleanLine.toLowerCase().includes('egg')}`);
        
        if (!cleanLine) {
            console.log(`❌ Empty line, skipping`);
            continue;
        }
        
        // Check skip conditions - skip role mentions and lines without eggs
        const shouldSkip = cleanLine.startsWith('<@&');
        
        console.log(`Should skip: ${shouldSkip}`);
        
        if (shouldSkip) {
            console.log(`⏭️ Skipping this line`);
            continue;
        }
        
        if (!cleanLine.toLowerCase().includes('egg')) {
            console.log(`⏭️ No 'egg' found, skipping`);
            continue;
        }
        
        console.log(`✅ Processing this line`);
        
        // If line contains "EGG STOCK", extract everything after it
        let processedLine = cleanLine;
        if (cleanLine.toLowerCase().includes('egg stock')) {
            // Find the position after "EGG STOCK****:"
            const stockIndex = cleanLine.toLowerCase().indexOf('egg stock');
            const afterStock = cleanLine.substring(stockIndex);
            const colonIndex = afterStock.indexOf(':');
            if (colonIndex !== -1) {
                processedLine = afterStock.substring(colonIndex + 1).trim();
                console.log(`Found EGG STOCK header, extracting content after colon: "${processedLine}"`);
            }
        }
        
        console.log(`Before processing: "${processedLine}"`);
        
        // **FIXED**: Clean Discord emojis FIRST, then extract egg info
        // Remove Discord custom emojis but keep track of them for egg type detection
        const emojiMatches = processedLine.match(/<:(\w+):(\d+)>/g);
        console.log(`Found emojis: ${emojiMatches ? emojiMatches.join(', ') : 'none'}`);
        
        // Remove emojis from the line but keep the rest
        let lineWithoutEmojis = processedLine.replace(/<:[^:]+:\d+>/g, '').trim();
        console.log(`After emoji removal: "${lineWithoutEmojis}"`);
        
        // Clean markdown formatting
        lineWithoutEmojis = lineWithoutEmojis.replace(/\*+/g, '').trim();
        console.log(`After markdown removal: "${lineWithoutEmojis}"`);
        
        // **IMPROVED**: Enhanced egg parsing with better pattern matching
        let foundEgg = false;
        
        // Pattern 1: "Egg Name **x1**" or "Egg Name x1"
        const pattern1 = /([a-zA-Z\s]*egg[a-zA-Z\s]*)\s*x(\d+)/gi;
        let match1;
        
        // Reset regex index
        pattern1.lastIndex = 0;
        
        while ((match1 = pattern1.exec(lineWithoutEmojis)) !== null) {
            let eggType = match1[1].trim();
            const quantity = parseInt(match1[2]);
            
            // **FIXED**: Clean up egg type properly
            eggType = eggType.replace(/[^\w\s]/g, '').trim();
            
            // **FIXED**: Capitalize properly
            eggType = eggType.split(' ').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
            
            console.log(`🥚 Pattern 1 match: "${eggType}" x${quantity}`);
            
            if (quantity > 0 && eggType && eggType.length > 2) {
                for (let j = 0; j < quantity; j++) {
                    eggData.push({
                        type: eggType,
                        quantity: 1
                    });
                }
                foundEgg = true;
            }
        }
        
        // Pattern 2: "x1 Egg Name" (if pattern 1 didn't match)
        if (!foundEgg) {
            const pattern2 = /x(\d+)\s*([a-zA-Z\s]*egg[a-zA-Z\s]*)/gi;
            let match2;
            
            // Reset regex index
            pattern2.lastIndex = 0;
            
            while ((match2 = pattern2.exec(lineWithoutEmojis)) !== null) {
                const quantity = parseInt(match2[1]);
                let eggType = match2[2].trim();
                
                // **FIXED**: Clean up egg type properly
                eggType = eggType.replace(/[^\w\s]/g, '').trim();
                
                // **FIXED**: Capitalize properly
                eggType = eggType.split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');
                
                console.log(`🥚 Pattern 2 match: "${eggType}" x${quantity}`);
                
                if (quantity > 0 && eggType && eggType.length > 2) {
                    for (let j = 0; j < quantity; j++) {
                        eggData.push({
                            type: eggType,
                            quantity: 1
                        });
                    }
                    foundEgg = true;
                }
            }
        }
        
        // Pattern 3: Just "Egg Name" (assume quantity 1) - only if no quantity found
        if (!foundEgg) {
            const eggPattern = /([a-zA-Z\s]*egg[a-zA-Z\s]*)/gi;
            let eggMatch;
            
            // Reset regex index
            eggPattern.lastIndex = 0;
            
            while ((eggMatch = eggPattern.exec(lineWithoutEmojis)) !== null) {
                let eggType = eggMatch[1].trim();
                
                // **FIXED**: Clean up the egg type properly
                eggType = eggType.replace(/[^\w\s]/g, '').trim();
                
                // **FIXED**: Capitalize properly
                eggType = eggType.split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');
                
                console.log(`🥚 Pattern 3 match: "${eggType}" (assume x1)`);
                
                if (eggType && eggType.length > 3) {
                    eggData.push({
                        type: eggType,
                        quantity: 1
                    });
                    foundEgg = true;
                }
            }
        }
        
        console.log(`📊 Line result: ${foundEgg ? 'Found egg(s)' : 'No eggs found'}`);
        console.log(`📈 Total eggs so far: ${eggData.length}`);
    }
    
    console.log('\n🎯 === FINAL RESULTS ===');
    console.log(`Total eggs parsed: ${eggData.length}`);
    eggData.forEach((egg, index) => {
        console.log(`${index + 1}. ${egg.type} (qty: ${egg.quantity})`);
    });
    console.log('=== EGG PARSING DEBUG END ===\n');
    
    return eggData;
}

    // Get rarest egg for thumbnail
    getRarestEgg(eggData) {
        if (!eggData || eggData.length === 0) return null;

        const rarityOrder = [
            'common',
            'uncommon', 
            'rare',
            'legendary',
            'mythical',
            'bug',
            'night',
            'premium night'
        ];

        // ✅ แก้ไข: ใช้ URL รูปภาพจริงแทน path ท้องถิ่น
        const eggImages = {
            'common': 'https://i.postimg.cc/tTP5DHLD/Common-egg.webp',
            'uncommon': 'https://i.postimg.cc/vHXv0hNR/Uncommon-egg.webp',
            'rare': 'https://i.postimg.cc/wT9V5ZFc/Rare-egg.webp',
            'legendary': 'https://i.postimg.cc/HWwzyd0k/Legendary-egg.webp',
            'mythical': 'https://i.postimg.cc/Y0Hxss77/Mythical-egg.webp',
            'bug': 'https://i.postimg.cc/0NhnpNHb/Bug-egg.webp',
            'night': 'https://i.postimg.cc/wMQk8Qxm/Night-egg.webp',
            'premium night': 'https://i.postimg.cc/wMQk8Qxm/Night-egg.webp'
        };

        let rarestEgg = null;
        let rarestRarity = -1;

        for (const egg of eggData) {
            const eggType = egg.type.toLowerCase();
            
            for (let i = rarityOrder.length - 1; i >= 0; i--) {
                if (eggType.includes(rarityOrder[i])) {
                    if (i > rarestRarity) {
                        rarestRarity = i;
                        rarestEgg = {
                            name: egg.type,
                            rarity: rarityOrder[i],
                            image: eggImages[rarityOrder[i]]
                        };
                    }
                    break;
                }
            }
        }

        // ✅ Default fallback ที่ใช้งานได้
        return rarestEgg || {
            name: 'Common Egg',
            rarity: 'common',
            image: 'https://i.postimg.cc/tTP5DHLD/Common-egg.webp'
        };
    }

    // Create custom embed for egg notifications - UPDATED with author and dynamic thumbnail
    createEggEmbed(eggData) {
        if (!eggData || eggData.length === 0) {
            return null;
        }

        let eggList = '';
        let totalEggs = eggData.length;
        
        const eggEmojis = {
            'common': '<:Common_egg:1375477638604259388>',
            'uncommon egg': '<:Uncommon_egg:1375477630165450753>',
            'rare': '<:Rare_egg:1375477627556597800>',
            'epic': '<:Legendary_egg:1375477636318367744>', // ใช้ Legendary แทน Epic
            'legendary': '<:Legendary_egg:1375477636318367744>',
            'mythical': '<:Mythical_egg:1375477624754667652>',
            'bug': '<:Bug_egg:1375477633596391568>',
            'night': '<:Night_egg:1375477622351466526>',
            'premium night': '<:Premium_Night_egg:1375477619956645988>'
        };

        const eggGroups = {};
        for (const egg of eggData) {
            if (!eggGroups[egg.type]) {
                eggGroups[egg.type] = 0;
            }
            eggGroups[egg.type]++;
        }

        // ✅ แก้ไข: เพิ่มการขึ้นบรรทัดใหม่หลังจากไข่ที่ 3
        for (const [eggType, count] of Object.entries(eggGroups)) {
            let emoji = '<:Common_egg:1375477638604259388>';
            
            // เรียงลำดับจากเฉพาะเจาะจงที่สุดไปหาทั่วไป
            const eggTypeLower = eggType.toLowerCase();
            
            if (eggTypeLower.includes('premium night')) {
                emoji = '<:Premium_Night_egg:1375477619956645988>';
            } else if (eggTypeLower.includes('mythical')) {
                emoji = '<:Mythical_egg:1375477624754667652>';
            } else if (eggTypeLower.includes('legendary')) {
                emoji = '<:Legendary_egg:1375477636318367744>';
            } else if (eggTypeLower.includes('night')) {
                emoji = '<:Night_egg:1375477622351466526>';
            } else if (eggTypeLower.includes('bug')) {
                emoji = '<:Bug_egg:1375477633596391568>';
            } else if (eggTypeLower.includes('rare')) {
                emoji = '<:Rare_egg:1375477627556597800>';
            } else if (eggTypeLower.includes('uncommon')) {
                emoji = '<:Uncommon_egg:1375477630165450753>';
            } else if (eggTypeLower.includes('common')) {
                emoji = '<:Common_egg:1375477638604259388>';
            }
            
            eggList += `${emoji} **${eggType}** × ${count}\n`;
        }

        const rarestEgg = this.getRarestEgg(eggData);
        
        // ✅ แก้ไข: เอา image URLs ออกหรือใช้ URL ที่ถูกต้อง
        return {
            author: {
                name: 'Grow a Garden Stocks 🥚',
                icon_url: "https://i.postimg.cc/4xQn62Lt/123123dsad-Photoroom.png"
            },
            description: '**EGG STOCK** :\n' + eggList + '‎',
            color: 0xec5d69,
            footer: {
                text: `Total: ${totalEggs} eggs • ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`
            },
            thumbnail: {
                url: rarestEgg.image
            }
        };
    }

    // Send webhook message with custom or original content
    // แทนที่ฟังก์ชัน sendWebhook เดิม
// แทนที่ฟังก์ชัน sendWebhook เดิมด้วยโค้ดนี้
async sendWebhook(webhookUrl, content, originalMessage, notificationType) {
    try {
        let payload = {
            username: 'Notification Relay',
            avatar_url: client.user?.displayAvatarURL() || null
        };

        // Handle egg notifications with custom embed
        if (notificationType === 'egg_notifications') {
            const eggData = this.parseEggData(content);
            const customEmbed = this.createEggEmbed(eggData);
            
            if (customEmbed) {
                payload.embeds = [customEmbed];
                payload.content = ''; // No plain text content for egg notifications
                
                // Add debug info to console
                console.log(`🥚 Parsed ${eggData.length} eggs:`, eggData.map(egg => `${egg.type} x${egg.quantity}`).join(', '));
            } else {
                // Fallback to original content if parsing fails
                payload.content = content;
                console.log('⚠️ Failed to parse egg data, using original content');
            }
        } 
        // Handle weather notifications - เฉพาะ embed อย่างเดียว พร้อมแก้ไข
        else if (notificationType === 'weather_notifications') {
            console.log(`🌤️ Processing weather notification...`);
            console.log(`📊 Original message has ${originalMessage.embeds?.length || 0} embeds`);
            
            if (originalMessage.embeds && originalMessage.embeds.length > 0) {
                try {
                    payload.embeds = originalMessage.embeds.map((embed, index) => {
                        console.log(`📋 Processing embed ${index + 1}:`, {
                            title: embed.title,
                            description: embed.description?.substring(0, 50) + '...',
                            hasImage: !!embed.image,
                            hasThumbnail: !!embed.thumbnail,
                            fieldsCount: embed.fields?.length || 0,
                            color: embed.color
                        });
                        
                        // สร้าง embed object ใหม่อย่างระมัดระวัง
                        const embedData = {};
                        
                        // เพิ่ม properties ทีละตัวและเช็คว่าไม่เป็น null/undefined
                        if (embed.title) {
                            embedData.title = embed.title;
                        }
                        
                        if (embed.description) {
                            embedData.description = embed.description;
                        }
                        
                        if (embed.color !== null && embed.color !== undefined) {
                            embedData.color = embed.color;
                        }
                        
                        // ใช้ timestamp ปัจจุบันเสมอ
                        embedData.timestamp = new Date().toISOString();
                        
                        // จัดการ footer
                        if (embed.footer && embed.footer.text) {
                            embedData.footer = {
                                text: embed.footer.text
                            };
                            // เพิ่ม icon_url ถ้ามี
                            if (embed.footer.iconURL || embed.footer.icon_url) {
                                embedData.footer.icon_url = embed.footer.iconURL || embed.footer.icon_url;
                            }
                        }
                        
                        // จัดการ author
                        if (embed.author && embed.author.name) {
                            embedData.author = {
                                name: embed.author.name
                            };
                            if (embed.author.iconURL || embed.author.icon_url) {
                                embedData.author.icon_url = embed.author.iconURL || embed.author.icon_url;
                            }
                            if (embed.author.url) {
                                embedData.author.url = embed.author.url;
                            }
                        }
                        
                        // จัดการ fields
                        if (embed.fields && embed.fields.length > 0) {
                            embedData.fields = embed.fields.map(field => ({
                                name: field.name || 'No Name',
                                value: field.value || 'No Value',
                                inline: Boolean(field.inline)
                            }));
                        }
                        
                        // จัดการ image
                        if (embed.image && (embed.image.url || embed.image.proxyURL)) {
                            embedData.image = {
                                url: embed.image.url || embed.image.proxyURL
                            };
                        }
                        
                        // แก้ไข thumbnail เป็นรูปที่คุณต้องการ
                        embedData.thumbnail = {
                            url: "https://i.postimg.cc/5yqzG999/Growagardenwikilogonew.webp"
                        };
                        
                        // จัดการ URL
                        if (embed.url) {
                            embedData.url = embed.url;
                        }
                        
                        console.log(`✅ Processed embed ${index + 1} with ${Object.keys(embedData).length} properties`);
                        console.log(`📄 Final embed structure:`, Object.keys(embedData));
                        
                        return embedData;
                    });
                    
                    // ไม่ส่ง content (ข้อความธรรมดา) เลย
                    payload.content = '';
                    
                    console.log(`🌤️ Weather notification: Sending ${payload.embeds.length} embed(s) with custom thumbnail`);
                    console.log(`📊 Embed validation:`, payload.embeds.map(embed => ({
                        hasTitle: !!embed.title,
                        hasDescription: !!embed.description,
                        hasFields: !!(embed.fields && embed.fields.length > 0),
                        hasColor: embed.color !== undefined,
                        hasTimestamp: !!embed.timestamp,
                        hasThumbnail: !!embed.thumbnail
                    })));
                    
                } catch (embedError) {
                    console.error('❌ Error processing weather embeds:', embedError.message);
                    console.error('❌ Stack trace:', embedError.stack);
                    
                    // Fallback: ส่งเป็น content แทน
                    payload.content = content;
                    delete payload.embeds;
                    console.log('⚠️ Fallback: Using content instead of embeds');
                }
            } else {
                // ถ้าไม่มี embed ให้ส่งเป็น content แทน
                payload.content = content;
                console.log('⚠️ No embeds found in weather message, using content instead');
            }
        } 
        // Handle other notification types (ถ้ามี)
        else {
            payload.content = content;
            
            // สำหรับ notification types อื่นๆ ให้คัดลอก embeds แบบเดิม
            if (originalMessage.embeds && originalMessage.embeds.length > 0) {
                try {
                    payload.embeds = originalMessage.embeds.map(embed => {
                        const embedJSON = embed.toJSON();
                        // เพิ่ม timestamp ถ้าไม่มี
                        if (!embedJSON.timestamp) {
                            embedJSON.timestamp = new Date().toISOString();
                        }
                        return embedJSON;
                    });
                } catch (error) {
                    console.error('❌ Error copying embeds for other notification types:', error.message);
                }
            }
        }

        // Debug ข้อมูลที่จะส่ง
        console.log(`📤 Sending payload:`, {
            hasContent: !!payload.content && payload.content.length > 0,
            hasEmbeds: !!(payload.embeds && payload.embeds.length > 0),
            embedsCount: payload.embeds?.length || 0,
            payloadSize: JSON.stringify(payload).length
        });

        const response = await axios.post(webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000 // เพิ่มเวลา timeout
        });

        if (response.status === 204) {
            console.log(`✅ Webhook sent successfully for ${notificationType}`);
            return true;
        } else {
            console.error('❌ Webhook response error:', response.status, response.statusText);
            return false;
        }

    } catch (error) {
        console.error('❌ Webhook send error:', error.message);
        
        if (error.response) {
            console.error('❌ Response status:', error.response.status);
            console.error('❌ Response headers:', error.response.headers);
            console.error('❌ Response data:', JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.code) {
            console.error('❌ Error code:', error.code);
        }
        
        // หากเป็น error เรื่อง embed ลองส่งแค่ content
        if (error.response && error.response.status === 400 && notificationType === 'weather_notifications') {
            console.log('⚠️ Retrying weather notification with content only...');
            try {
                const fallbackPayload = {
                    content: content,
                    username: 'Notification Relay',
                    avatar_url: client.user?.displayAvatarURL() || null
                };
                
                const retryResponse = await axios.post(webhookUrl, fallbackPayload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });
                
                if (retryResponse.status === 204) {
                    console.log('✅ Fallback weather notification sent successfully');
                    return true;
                }
            } catch (retryError) {
                console.error('❌ Fallback also failed:', retryError.message);
            }
        }
        
        return false;
    }
}
    // Send non-image attachments as separate message
    async sendAttachments(webhookUrl, attachments) {
        try {
            const attachmentUrls = attachments.map(att => att.url).join('\n');
            if (!attachmentUrls.trim()) return;

            const payload = {
                content: `📎 **ไฟล์แนบ:**\n${attachmentUrls}`,
                username: 'Notification Relay',
                avatar_url: client.user?.displayAvatarURL() || null
            };

            await axios.post(webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

        } catch (error) {
            console.error('❌ Error sending attachments:', error.message);
        }
    }

    // Get latest message from source channel with full embed data
    async getLatestMessage(notificationType) {
        try {
            const sourceChannelId = CONFIG.source_channels[notificationType];
            if (!sourceChannelId) {
                console.log(`⚠️  No source channel configured for ${notificationType}`);
                return null;
            }

            const sourceChannel = client.channels.cache.get(sourceChannelId);
            if (!sourceChannel) {
                console.log(`❌ Cannot find source channel for ${notificationType}`);
                return null;
            }

            // Fetch latest messages
            const messages = await sourceChannel.messages.fetch({ limit: 10 });
            const messagesArray = Array.from(messages.values());

            // Find the most recent message with content or embeds
            for (const message of messagesArray) {
                if (!message || message.author.id === client.user.id) continue;
                
                const content = this.extractMessageContent(message);
                if (content && content !== 'ไม่พบเนื้อหาข้อความ') {
                    return {
                        message: message,
                        content: content,
                        hasEmbeds: message.embeds && message.embeds.length > 0,
                        embedsData: message.embeds && message.embeds.length > 0 ? message.embeds.map(embed => embed.toJSON()) : []
                    };
                }
            }

            return null;
        } catch (error) {
            console.error(`❌ Error getting latest message for ${notificationType}:`, error.message);
            return null;
        }
    }

    // Check and relay messages
    async checkAndRelayMessages() {
        try {
            for (const [notificationType, sourceChannelId] of Object.entries(CONFIG.source_channels)) {
                if (!sourceChannelId) {
                    console.log(`⚠️  No source channel configured for ${notificationType}`);
                    continue;
                }
    
                const webhookUrl = CONFIG.webhook_urls[notificationType];
                if (!webhookUrl) {
                    console.log(`⚠️  No webhook URL configured for ${notificationType}`);
                    continue;
                }
    
                const sourceChannel = client.channels.cache.get(sourceChannelId);
                if (!sourceChannel) {
                    console.log(`❌ Cannot find source channel for ${notificationType}`);
                    continue;
                }
    
                try {
                    // Fetch recent messages
                    const messages = await sourceChannel.messages.fetch({ limit: 10 });
                    const messagesArray = Array.from(messages.values()).reverse();
    
                    if (messagesArray.length === 0) continue;
    
                    // Find new messages
                    const lastId = lastMessageIds[notificationType];
                    const newMessages = lastId 
                        ? messagesArray.filter(msg => msg.id > lastId)
                        : [messagesArray[messagesArray.length - 1]];
    
                    // Update last processed message ID
                    if (messagesArray.length > 0) {
                        lastMessageIds[notificationType] = messagesArray[messagesArray.length - 1].id;
                    }
    
                    // Process new messages
                    for (const message of newMessages) {
                        if (!message || message.author.id === client.user.id) continue; // Skip own messages
    
                        try {
                            // Extract the original content from the message
                            const originalContent = this.extractMessageContent(message);
                            
                            console.log(`\n🔍 Processing ${notificationType} message:`);
                            console.log(`📝 Raw content: "${originalContent}"`);
                            console.log(`📊 Message has ${message.embeds?.length || 0} embeds`);
                            
                            if (originalContent && originalContent !== 'ไม่พบเนื้อหาข้อความ') {
                                console.log(`📤 Relaying ${notificationType}: ${originalContent.substring(0, 100)}...`);
                                
                                // Special debugging for egg notifications
                                if (notificationType === 'egg_notifications') {
                                    console.log(`\n🥚 EGG DEBUG - Raw content to parse:`);
                                    console.log(`"${originalContent}"`);
                                    console.log(`Length: ${originalContent.length} characters`);
                                    console.log(`Lines: ${originalContent.split('\n').length}`);
                                    
                                    // Log each line separately
                                    originalContent.split('\n').forEach((line, index) => {
                                        console.log(`Line ${index}: "${line}"`);
                                    });
                                }
                                
                                // Send the message via webhook (with custom handling for eggs)
                                const success = await this.sendWebhook(webhookUrl, originalContent, message, notificationType);
                                
                                if (success) {
                                    console.log(`✅ Successfully relayed ${notificationType} message`);
                                } else {
                                    console.log(`❌ Failed to relay ${notificationType} message`);
                                }
                            } else {
                                console.log(`⚠️  No content found in ${notificationType} message`);
                                console.log(`Message details:`, {
                                    id: message.id,
                                    content: message.content,
                                    embedsCount: message.embeds?.length || 0,
                                    authorId: message.author?.id
                                });
                            }
    
                            // Send non-image attachments as separate message
                            if (message.attachments && message.attachments.size > 0) {
                                const nonImageAttachments = Array.from(message.attachments.values()).filter(att => 
                                    att && att.contentType && !att.contentType.startsWith('image/')
                                );
                                
                                if (nonImageAttachments.length > 0) {
                                    await this.sendAttachments(webhookUrl, nonImageAttachments);
                                }
                            }
    
                            // Delay to avoid rate limiting
                            await new Promise(resolve => setTimeout(resolve, 2000));
    
                        } catch (error) {
                            console.error(`❌ Error relaying message: ${error.message || error}`);
                            console.error('Message details:', {
                                id: message?.id,
                                content: message?.content?.substring(0, 100),
                                author: message?.author?.username,
                                channel: message?.channel?.name
                            });
                        }
                    }
    
                } catch (error) {
                    console.error(`❌ Error fetching messages from ${notificationType}: ${error.message || error}`);
                }
            }
    
            // Save data after processing
            this.saveData();
    
        } catch (error) {
            console.error('❌ Error in checkAndRelayMessages:', error.message || error);
        }
    }

    // Test webhook functionality with real data from source channel
    async testWebhook(type = 'egg') {
        const notificationType = type === 'egg' ? 'egg_notifications' : 'weather_notifications';
        const webhookUrl = CONFIG.webhook_urls[notificationType];
        
        console.log(`🧪 Testing webhook for ${type}`);
        console.log(`📋 Webhook URL configured: ${webhookUrl ? 'Yes' : 'No'}`);
        
        if (!webhookUrl) {
            console.log(`❌ No webhook URL configured for ${type}`);
            return false;
        }

        // Test basic webhook connectivity first
        try {
            console.log(`🔍 Testing basic webhook connectivity...`);
            const basicPayload = {
                content: `🧪 Basic webhook test for ${type} - ${new Date().toISOString()}`,
                username: 'Test Bot'
            };

            const basicResponse = await axios.post(webhookUrl, basicPayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            if (basicResponse.status !== 204) {
                console.log(`❌ Basic webhook test failed: ${basicResponse.status}`);
                return false;
            }

            console.log(`✅ Basic webhook connectivity OK`);
            
            // Wait a bit before next test
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`❌ Basic webhook test failed:`, error.message);
            if (error.response) {
                console.error(`Response status: ${error.response.status}`);
                console.error(`Response data:`, error.response.data);
            }
            return false;
        }

        // Now test with real data
        const latestData = await this.getLatestMessage(notificationType);
        
        if (!latestData) {
            console.log(`❌ No recent messages found in ${type} source channel`);
            // Test with dummy data instead
            return await this.testWithDummyData(webhookUrl, type);
        }

        const { message: originalMessage, content } = latestData;

        try {
            let payload = {
                username: 'Notification Relay (TEST)',
                avatar_url: null // ✅ ตั้งเป็น null ก่อน
            };

            if (type === 'egg') {
                console.log(`🥚 Testing egg parsing with content: "${content.substring(0, 100)}..."`);
                
                const eggData = this.parseEggData(content);
                console.log(`🥚 Parsed ${eggData.length} eggs`);
                
                if (eggData.length > 0) {
                    const customEmbed = this.createEggEmbed(eggData);
                    
                    if (customEmbed) {
                        customEmbed.author.name = '🧪 TEST - ' + customEmbed.author.name;
                        customEmbed.footer.text = `TEST MESSAGE • ${customEmbed.footer.text}`;
                        
                        payload.embeds = [customEmbed];
                        payload.content = '';
                        
                        console.log(`🧪 Using custom embed for ${eggData.length} eggs`);
                    } else {
                        payload.content = `🧪 **TEST MESSAGE**\n\n${content}`;
                        console.log(`⚠️ Failed to create custom embed, using plain text`);
                    }
                } else {
                    payload.content = `🧪 **TEST MESSAGE** (No eggs parsed)\n\n${content}`;
                    console.log(`⚠️ No eggs parsed from content`);
                }
            } else {
                payload.content = `🧪 **TEST MESSAGE**\n\n${content}`;
            }

            console.log(`📤 Sending webhook payload...`);
            console.log(`📋 Payload keys: ${Object.keys(payload).join(', ')}`);

            const response = await axios.post(webhookUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });

            const success = response.status === 204;
            console.log(`${success ? '✅' : '❌'} Webhook test ${success ? 'successful' : 'failed'} for ${type}`);
            
            return success;

        } catch (error) {
            console.error(`❌ Webhook test error for ${type}:`, error.message);
            
            if (error.response) {
                console.error(`❌ Response Status: ${error.response.status}`);
                console.error(`❌ Response Data:`, JSON.stringify(error.response.data, null, 2));
            }
            
            if (error.code === 'ECONNREFUSED') {
                console.error(`❌ Connection refused - check webhook URL`);
            } else if (error.code === 'ETIMEDOUT') {
                console.error(`❌ Request timeout - webhook server may be slow`);
            }
            
            return false;
        }
    }

    async testWithDummyData(webhookUrl, type) {
        console.log(`🧪 Testing with dummy ${type} data...`);
        
        try {
            let payload = {
                username: 'Notification Relay (DUMMY TEST)',
                avatar_url: null
            };

            if (type === 'egg') {
                const dummyEggData = [
                    { type: 'Common Egg', quantity: 1 },
                    { type: 'Rare Egg', quantity: 1 },
                    { type: 'Legendary Egg', quantity: 1 }
                ];

                const customEmbed = this.createEggEmbed(dummyEggData);
                if (customEmbed) {
                    customEmbed.author.name = '🧪 DUMMY TEST - ' + customEmbed.author.name;
                    customEmbed.footer.text = `DUMMY TEST • ${customEmbed.footer.text}`;
                    payload.embeds = [customEmbed];
                } else {
                    payload.content = `🧪 **DUMMY TEST**\nCommon Egg x1\nRare Egg x1\nLegendary Egg x1`;
                }
            } else {
                payload.content = `🧪 **DUMMY ${type.toUpperCase()} TEST**\nThis is a test message with dummy data.`;
            }

            const response = await axios.post(webhookUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            const success = response.status === 204;
            console.log(`${success ? '✅' : '❌'} Dummy webhook test ${success ? 'successful' : 'failed'} for ${type}`);
            return success;

        } catch (error) {
            console.error(`❌ Dummy webhook test error:`, error.message);
            return false;
        }
    }
}

// Initialize relay system
const relay = new WebhookRelay();

// Bot events
client.once('ready', () => {
    console.log(`🤖 Bot logged in as ${client.user.tag}!`);
    console.log(`📊 Bot is in ${client.guilds.cache.size} guilds`);
    
    // เริ่ม Express server หลังจาก bot ready
    app.listen(PORT, () => {
        console.log(`🌐 Web server running on port ${PORT}`);
    });
    
    // Start message checking loop
    setInterval(() => {
        relay.checkAndRelayMessages();
    }, CONFIG.check_interval);
    
    console.log(`⏰ Message check interval: ${CONFIG.check_interval / 1000} seconds`);
});

// เพิ่ม keep-alive mechanism (เพิ่มหลัง CONFIG)
const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; // 14 นาที

function keepAlive() {
    // ทำ self-ping ทุก 14 นาที
    setInterval(() => {
        console.log('💓 Keep alive ping...');
        // ส่ง request ไปหาตัวเอง
        const appUrl = process.env.RENDER_EXTERNAL_URL;
        if (appUrl) {
            require('https').get(appUrl, (res) => {
                console.log(`💓 Keep alive response: ${res.statusCode}`);
            }).on('error', (err) => {
                console.log('💓 Keep alive error:', err.message);
            });
        }
    }, KEEP_ALIVE_INTERVAL);
}

// Command handling (for testing purposes)
client.on('messageCreate', async (message) => {
    // Only respond to own messages with prefix
    if (!message || message.author.id !== client.user.id || !message.content.startsWith(CONFIG.prefix)) return;

    const args = message.content.slice(CONFIG.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'webhook-test':
                const type = args[0] || 'egg';
                await message.edit(`🧪 Testing ${type} webhook with real data...`);
                const success = await relay.testWebhook(type);
                setTimeout(() => {
                    message.edit(`${success ? '✅' : '❌'} Webhook test ${success ? 'completed' : 'failed'} for ${type} (using real data)`);
                }, 2000);
                break;
            case 'webhook-status':
                let status = '📊 **Webhook Status**\n\n';
                for (const [type, url] of Object.entries(CONFIG.webhook_urls)) {
                    if (url) {
                        status += `✅ ${type}: Configured\n`;
                    } else {
                        status += `❌ ${type}: Not configured\n`;
                    }
                }
                status += '\n**Source Channels:**\n';
                for (const [type, channelId] of Object.entries(CONFIG.source_channels)) {
                    if (channelId) {
                        const channel = client.channels.cache.get(channelId);
                        status += `✅ ${type}: ${channel ? channel.name : 'Unknown Channel'}\n`;
                    } else {
                        status += `❌ ${type}: Not configured\n`;
                    }
                }
                await message.edit(status);
                break;
            case 'latest-msg':
                const msgType = args[0] || 'egg';
                const notificationType = msgType === 'egg' ? 'egg_notifications' : 'weather_notifications';
                await message.edit(`🔍 Fetching latest ${msgType} message...`);
                
                const latestData = await relay.getLatestMessage(notificationType);
                if (latestData) {
                    const preview = latestData.content.substring(0, 200);
                    setTimeout(() => {
                        message.edit(`📋 **Latest ${msgType} message:**\n\`\`\`\n${preview}${latestData.content.length > 200 ? '...' : ''}\n\`\`\``);
                    }, 1000);
                } else {
                    setTimeout(() => {
                        message.edit(`❌ No recent ${msgType} messages found`);
                    }, 1000);
                }
                break;
                case 'debug-egg':
    await message.edit(`🔍 Debugging egg parsing...`);
    
    const eggNotificationType = 'egg_notifications';
    const latestEggData = await relay.getLatestMessage(eggNotificationType);
    
    if (latestEggData) {
        const content = latestEggData.content;
        console.log('\n🥚 EGG DEBUG COMMAND');
        console.log('='.repeat(50));
        console.log('Raw content:');
        console.log(`"${content}"`);
        console.log('='.repeat(50));
        
        // Parse the eggs with debug info
        const eggData = relay.parseEggData(content);
        
        let debugInfo = `🔍 **Egg Parsing Debug**\n\n`;
        debugInfo += `**Raw Content (${content.length} chars):**\n\`\`\`\n${content}\n\`\`\`\n\n`;
        debugInfo += `**Parsed Results:**\n`;
        debugInfo += `• Total eggs found: ${eggData.length}\n`;
        
        if (eggData.length > 0) {
            debugInfo += `• Eggs:\n`;
            eggData.forEach((egg, index) => {
                debugInfo += `  ${index + 1}. ${egg.type} (qty: ${egg.quantity})\n`;
            });
        } else {
            debugInfo += `• ❌ No eggs parsed!\n`;
        }
        
        // Split message if too long
        if (debugInfo.length > 1900) {
            await message.edit(debugInfo.substring(0, 1900) + '...\n\n*Message truncated*');
        } else {
            await message.edit(debugInfo);
        }
    } else {
        await message.edit(`❌ No recent egg messages found for debugging`);
    }
    break;
    case 'webhook-debug':
                const debugType = args[0] || 'egg';
                await message.edit(`🔍 Debugging ${debugType} webhook...`);
                
                // ตรวจสอบ configuration
                const webhookUrl = CONFIG.webhook_urls[debugType === 'egg' ? 'egg_notifications' : 'weather_notifications'];
                let debugInfo = `🔍 **Webhook Debug for ${debugType}**\n\n`;
                
                debugInfo += `**Configuration:**\n`;
                debugInfo += `• Webhook URL: ${webhookUrl ? '✅ Configured' : '❌ Not configured'}\n`;
                debugInfo += `• Source Channel: ${CONFIG.source_channels[debugType === 'egg' ? 'egg_notifications' : 'weather_notifications'] ? '✅ Configured' : '❌ Not configured'}\n\n`;
                
                if (webhookUrl) {
                    // Test basic connectivity
                    try {
                        const testPayload = {
                            content: `🧪 Debug test - ${new Date().toISOString()}`,
                            username: 'Debug Bot'
                        };
                        
                        const response = await axios.post(webhookUrl, testPayload, {
                            headers: { 'Content-Type': 'application/json' },
                            timeout: 5000
                        });
                        
                        debugInfo += `**Connectivity Test:**\n✅ Webhook URL is reachable (Status: ${response.status})\n`;
                        
                    } catch (error) {
                        debugInfo += `**Connectivity Test:**\n❌ Webhook URL failed: ${error.message}\n`;
                        if (error.response) {
                            debugInfo += `❌ Status: ${error.response.status}\n`;
                            debugInfo += `❌ Error: ${JSON.stringify(error.response.data)}\n`;
                        }
                    }
                } else {
                    debugInfo += `**Connectivity Test:**\n❌ Cannot test - no webhook URL configured\n`;
                }
                
                await message.edit(debugInfo);
                break;
        }
    } catch (error) {
        console.error(`❌ Command error: ${error.message || error}`);
    }
    
});

// Error handling
client.on('error', error => {
    console.error('❌ Discord client error:', error.message || error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error.message || error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down webhook relay...');
    relay.saveData();
    client.destroy();
    process.exit(0);
});

// Login to Discord
client.login(CONFIG.user_token).then(() => {
    keepAlive();
}).catch(error => {
    console.error('❌ Failed to login:', error.message || error);
    process.exit(1);
});
