require('dotenv').config();

const mongoose = require('mongoose');
const Tournament = require('./Tournament');

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '-';

// ===============================
// BOT ACCESS CONTROL
// ===============================

const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

const BotAccessSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['admin', 'mod'],
        required: true
    },
    userId: {
        type: String,
        required: true,
        unique: true
    }
});

const BotAccess = mongoose.models.BotAccess ||
    mongoose.model('BotAccess', BotAccessSchema);

async function getBotAccess(userId) {

    if (userId === BOT_OWNER_ID) {
        return 'owner';
    }

    const access =
        await BotAccess.findOne({
            userId
        });

    if (!access) {
        return null;
    }

    return access.type;
}

async function hasBotAccess(userId) {
    return (
        await getBotAccess(userId)
    ) !== null;
}

async function hasBotAdminAccess(userId) {

    const access =
        await getBotAccess(userId);

    return (
        access === 'owner' ||
        access === 'admin'
    );
}

async function hasBotOwnerAccess(userId) {
    return userId === BOT_OWNER_ID;
}

// ==========================================
// MONGODB CONNECTION
// ==========================================

mongoose.connect(process.env.MONGO_URI)
    .then(() => {

        console.log(
            'Connected to MongoDB database successfully!'
        );

    })
    .catch(err => {

        console.error(
            'Database connection error:',
            err
        );

    });

// ==========================================
// BOT READY
// ==========================================

client.once('ready', () => {

    console.log(
        `Logged in as ${client.user.tag}! Tournament Sage loaded.`
    );

});

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on(
    'messageCreate',
    async message => {

        if (
            message.author.bot ||
            !message.guild
        ) {
            return;
        }

        // Only Bot Owner / Bot Admin / Bot Mod
        const botAccess =
            await getBotAccess(
                message.author.id
            );

        if (!botAccess) {
            return;
        }

        try {

            // ==========================================
            // ACTIVE SETUP CHECK
            // ==========================================

            const activeSetup =
                await Tournament.findOne({
                    guildId:
                        message.guildId,

                    channelId:
                        message.channelId,

                    status: {
                        $ne: 'complete'
                    }
                });

            // ==========================================
            // PREFIX COMMANDS
            // ==========================================

            if (
                message.content.startsWith(
                    PREFIX
                )
            ) {

                const args =
                    message.content
                        .slice(PREFIX.length)
                        .trim()
                        .split(/ +/);

                const baseCommand =
                    args
                        .shift()
                        ?.toLowerCase();

                // ===============================
                // -admin
                // ===============================

                if (
                    baseCommand === 'admin'
                ) {

                    if (
                        !(await hasBotOwnerAccess(
                            message.author.id
                        ))
                    ) {

                        return message.reply(
                            '❌ Only the **Bot Owner** can use this command.'
                        );
                    }

                    const action =
                        args[0]
                            ?.toLowerCase();

                    // ==========================================
                    // -admin list
                    // ==========================================

                    if (
                        action === 'list'
                    ) {

                        const admins =
                            await BotAccess.find({
                                type: 'admin'
                            });

                        if (
                            admins.length === 0
                        ) {

                            return message.reply(
                                '📭 **No Bot Admins currently assigned.**'
                            );
                        }

                        const adminList =
                            admins
                                .map(
                                    (
                                        admin,
                                        index
                                    ) =>
                                        `${index + 1}. <@${admin.userId}>`
                                )
                                .join('\n');

                        return message.reply(
                            `## Bot Admin List\n\n${adminList}`
                        );
                    }

                    // ==========================================
                    // -admin remove
                    // ==========================================

                    if (
                        action === 'remove'
                    ) {

                        const targetUser =
                            message.mentions.users.first() ||
                            (
                                args[1]
                                    ? await client.users
                                        .fetch(args[1])
                                        .catch(
                                            () => null
                                        )
                                    : null
                            );

                        if (!targetUser) {

                            return message.reply(
                                '❌ Please mention a user or provide their User ID.\n' +
                                'Example: `-admin remove @User`\n' +
                                'Example: `-admin remove 123456789012345678`'
                            );
                        }

                        if (
                            targetUser.id ===
                            BOT_OWNER_ID
                        ) {

                            return message.reply(
                                '❌ You cannot remove the Bot Owner.'
                            );
                        }

                        const removed =
                            await BotAccess.findOneAndDelete({
                                userId:
                                    targetUser.id,

                                type:
                                    'admin'
                            });

                        if (!removed) {

                            return message.reply(
                                `❌ **${targetUser.globalName || targetUser.username}** is not a Bot Admin.`
                            );
                        }

                        return message.reply(
                            `✅ **${targetUser.globalName || targetUser.username}** has been removed from **Bot Admins**.`
                        );
                    }

                    // ==========================================
                    // ADD ADMIN
                    // ==========================================

                    const targetUser =
                        message.mentions.users.first() ||
                        (
                            args[0]
                                ? await client.users
                                    .fetch(args[0])
                                    .catch(
                                        () => null
                                    )
                                : null
                        );

                    if (!targetUser) {

                        return message.reply(
                            '❌ Please mention a user or provide their User ID.\n' +
                            'Example: `-admin @User`\n' +
                            'Example: `-admin 123456789012345678`\n\n' +
                            'Use `-admin list` to see Bot Admins.'
                        );
                    }

                    if (
                        targetUser.id ===
                        BOT_OWNER_ID
                    ) {

                        return message.reply(
                            '❌ The Bot Owner cannot be added as an Admin.'
                        );
                    }

                    await BotAccess.findOneAndUpdate(
                        {
                            userId:
                                targetUser.id
                        },
                        {
                            userId:
                                targetUser.id,

                            type:
                                'admin'
                        },
                        {
                            upsert:
                                true,

                            new:
                                true
                        }
                    );

                    return message.reply(
                        `✅ **${targetUser.username}** is now a **Bot Admin**.`
                    );
                }

                // ===============================
// -help COMMAND
// ===============================
if (baseCommand === 'help') {
    const helpEmbed = new EmbedBuilder()
        .setTitle('🏆 Saste Nukers Commands')
        .setDescription('Use the commands below with the prefix `-` to control your tournaments and server access permissions.')
        .setColor('#3498DB')
        .addFields(
            { 
                name: '🏟️ Tournament Maker (`-tourney`)', 
                value: '• `-tourney make <name>` — Launch the server creation manager wizard.\n• `-tourney open <name>` — Load a specific tournament file as active.\n• `-tourney all` — View every tournament registry saved to this guild.\n• `-tourney cancel` — Abort an open step-by-step setup wizard.\n• `-tourney reset` — Completely wipe out the database layout history.' 
            },
            { 
                name: '📅 Tournament Matchday (`-md`)', 
                value: '• `-md <number>` — Output structural game sheets for a targeted matchday stage (e.g., `-md 1`).' 
            },
            { 
                name: '📌 Tournament Fixtures (`-fixture`)', 
                value: '• `-fixture <number>` — Output custom matchday schedule logs for teams.\n• `-fixture reserve` — Output structural calendars for items sitting on standby flags.' 
            },
            { 
                name: '⏱️ Reserver Tournament Matches (`-reserve`)', 
                value: '• `-reserve` — View all active entries waiting on the overflow queue.\n• `-reserve <match_num>` — Push a standard tournament match to the standby reservation list.' 
            },
            { 
                name: '⚙️ Fixture Settings (`-panel`)', 
                value: '• `-panel` — View global parameters (Overs, Deadlines, Player Reps settings).\n• `-panel overs <number>` — Change matching frame counts (e.g., `-panel overs 20`).\n• `-panel reps <allowed/not allowed>` — Toggle team player rotation rules.\n• `-panel fd <days>` — Configure opening phase timeline restrictions.\n• `-panel rd <days>` — Configure wrapping phase calendar boundaries.' 
            },
            { 
                name: '🔑 Bot Access Security (`-admin` / `-mod`)', 
                value: '• `-admin <@user/ID>` — Appoint a platform Bot Administrator.\n• `-admin list` / `-admin remove <@user>` — Review and adjust administrative tier slots.\n• `-mod <@user/ID>` — Appoint a structural staff Moderator.\n• `-mod list` / `-mod remove <@user>` — Review and manage server moderator positions.' 
            }
        )
        .setFooter({ text: 'Ensure the prefix (-) is attached before calling any feature command line string.' })
        .setTimestamp();

    return message.reply({ embeds: [helpEmbed] });
}


                // ===============================
                // -draw
                // ===============================

                // ===============================
// -draw
// ===============================

// ===============================
// -draw
// ===============================

if (baseCommand === 'draw') {

    const tournament = await Tournament.findOne({
        guildId: message.guildId,
        channelId: message.channelId,
        status: 'complete',
        isActive: true,
        liveDraws: true
    }).lean();

    if (!tournament) {
        return message.reply(
            '❌ There is currently no active tournament with Live Draws enabled.'
        );
    }

    const drawGroups = tournament.drawGroups || {};
    const revealState = tournament.drawRevealState || {};

    // ==========================================
    // -draw
    // SHOW CURRENT UPDATED DRAW
    // ==========================================

    if (!args[0]) {

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Current Live Group Draw');

        let description = '';

        for (const groupLetter of Object.keys(drawGroups)) {

            const teams = Array.isArray(drawGroups[groupLetter])
                ? drawGroups[groupLetter]
                : [];

            let revealed = Number(revealState[groupLetter]);

            if (!Number.isInteger(revealed) || revealed < 0) {
                revealed = 0;
            }

            if (revealed > teams.length) {
                revealed = teams.length;
            }

            description += `## Group ${groupLetter.toUpperCase()}\n`;

            for (let i = 0; i < teams.length; i++) {

                if (i < revealed) {
                    description += `${i + 1}. ${teams[i]}\n`;
                } else {
                    description += `${i + 1}. Hidden\n`;
                }
            }

            description += '\n';
        }

        embed.setDescription(description);

        return message.reply({
            embeds: [embed],
            allowedMentions: {
                parse: []
            }
        });
    }

    // ==========================================
    // -draw A
    // -draw B
    // -draw C
    // ==========================================

    const groupLetter = args[0].toLowerCase();

    if (!/^[a-z]$/.test(groupLetter)) {
        return message.reply(
            '❌ Please provide a valid group letter.\n' +
            'Example: `-draw A`'
        );
    }

    if (!Object.prototype.hasOwnProperty.call(drawGroups, groupLetter)) {
        return message.reply(
            `❌ **Group ${groupLetter.toUpperCase()}** does not exist.`
        );
    }

    const teams = Array.isArray(drawGroups[groupLetter])
        ? drawGroups[groupLetter]
        : [];

    // ==========================================
    // GET CURRENT REVEAL COUNT
    // ==========================================

    let revealed = Number(revealState[groupLetter]);

    if (!Number.isInteger(revealed) || revealed < 0) {
        revealed = 0;
    }

    if (revealed >= teams.length) {
        return message.reply(
            `⚠️ **Group ${groupLetter.toUpperCase()}** has already been fully revealed.`
        );
    }

    // ==========================================
    // NEXT HIDDEN TEAM
    // ==========================================

    const revealedTeam = teams[revealed];

    const updatedRevealState = {
        ...revealState,
        [groupLetter]: revealed + 1
    };

    // ==========================================
    // CHECK IF ALL TEAMS ARE REVEALED
    // ==========================================

    let everythingRevealed = true;

    for (const group of Object.keys(drawGroups)) {

        const groupTeams = Array.isArray(drawGroups[group])
            ? drawGroups[group]
            : [];

        let count = Number(updatedRevealState[group]);

        if (!Number.isInteger(count) || count < 0) {
            count = 0;
        }

        if (count > groupTeams.length) {
            count = groupTeams.length;
        }

        updatedRevealState[group] = count;

        if (count < groupTeams.length) {
            everythingRevealed = false;
        }
    }

    // ==========================================
    // SAVE UPDATED STATE
    // ==========================================

    const updateData = {
        drawRevealState: updatedRevealState
    };

    if (everythingRevealed) {
        updateData.liveDraws = false;
    }

    await Tournament.updateOne(
        {
            _id: tournament._id
        },
        {
            $set: updateData
        }
    );

    // ==========================================
    // ONLY SHOW THIS MESSAGE
    //
    // Group A
    // Team Name has been revealed!
    //
    // NO STADIUM
    // NO PING
    // NO EXTRA DRAW LIST
    // ==========================================

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setDescription(
            `**Group ${groupLetter.toUpperCase()}**\n` +
            `**${revealedTeam} has been revealed!**`
        );

    return message.reply({
        embeds: [embed],
        allowedMentions: {
            parse: []
        }
    });
}
                // ===============================
                // -mod
                // ===============================

                if (
                    baseCommand === 'mod'
                ) {

                    if (
                        !(await hasBotAdminAccess(
                            message.author.id
                        ))
                    ) {

                        return message.reply(
                            '❌ Only the **Bot Owner** or a **Bot Admin** can use this command.'
                        );
                    }

                    const action =
                        args[0]
                            ?.toLowerCase();

                    // ==========================================
                    // -mod remove
                    // ==========================================

                    if (
                        action === 'remove'
                    ) {

                        const targetUser =
                            message.mentions.users.first() ||
                            (
                                args[1]
                                    ? await client.users
                                        .fetch(args[1])
                                        .catch(
                                            () => null
                                        )
                                    : null
                            );

                        if (!targetUser) {

                            return message.reply(
                                '❌ Please mention a user or provide their User ID.\n' +
                                'Example: `-mod remove @User`\n' +
                                'Example: `-mod remove 123456789012345678`'
                            );
                        }

                        if (
                            targetUser.id ===
                            BOT_OWNER_ID
                        ) {

                            return message.reply(
                                '❌ You cannot remove the Bot Owner.'
                            );
                        }

                        const removed =
                            await BotAccess.findOneAndDelete({
                                userId:
                                    targetUser.id,

                                type:
                                    'mod'
                            });

                        if (!removed) {

                            return message.reply(
                                `❌ **${targetUser.globalName || targetUser.username}** is not a Bot Mod.`
                            );
                        }

                        return message.reply(
                            `✅ **${targetUser.globalName || targetUser.username}** has been removed from **Bot Mods**.`
                        );
                    }

                    // ==========================================
                    // -mod list
                    // ==========================================

                    if (
                        action === 'list'
                    ) {

                        const mods =
                            await BotAccess.find({
                                type:
                                    'mod'
                            });

                        if (
                            mods.length === 0
                        ) {

                            return message.reply(
                                '📭 **No Bot Mods currently assigned.**'
                            );
                        }

                        const modList =
                            mods
                                .map(
                                    (
                                        mod,
                                        index
                                    ) =>
                                        `${index + 1}. <@${mod.userId}>`
                                )
                                .join('\n');

                        return message.reply(
                            `## Bot Mod List\n\n${modList}`
                        );
                    }

                    // ==========================================
                    // ADD MOD
                    // ==========================================

                    const targetUser =
                        message.mentions.users.first() ||
                        (
                            args[0]
                                ? await client.users
                                    .fetch(args[0])
                                    .catch(
                                        () => null
                                    )
                                : null
                        );

                    if (!targetUser) {

                        return message.reply(
                            '❌ Please mention a user or provide their User ID.\n' +
                            'Example: `-mod @User`\n' +
                            'Example: `-mod 123456789012345678`\n\n' +
                            'Use `-mod list` to see Bot Mods.'
                        );
                    }

                    if (
                        targetUser.id ===
                        BOT_OWNER_ID
                    ) {

                        return message.reply(
                            '❌ The Bot Owner already has full access.'
                        );
                    }

                    const existing =
                        await BotAccess.findOne({
                            userId:
                                targetUser.id
                        });

                    if (
                        existing?.type ===
                        'admin'
                    ) {

                        return message.reply(
                            `⚠️ <@${targetUser.id}> is already a **Bot Admin**.`
                        );
                    }

                    await BotAccess.findOneAndUpdate(
                        {
                            userId:
                                targetUser.id
                        },
                        {
                            userId:
                                targetUser.id,

                            type:
                                'mod'
                        },
                        {
                            upsert:
                                true,

                            new:
                                true
                        }
                    );

                    return message.reply(
                        `✅ **${targetUser.username}** is now a **Bot Mod**.`
                    );
                }

                // ==========================================
                // 1. MATCHDAY COMMAND
                // -md <number>
                // ==========================================

                                // ==========================================
                // 1. MATCHDAY COMMAND
                // -md <number>
                // ==========================================

                if (
                    baseCommand === 'md'
                ) {

                    const targetDayNum =
                        parseInt(
                            args[0],
                            10
                        );

                    if (!targetDayNum) {

                        return message.reply(
                            '❌ Please specify a valid matchday number. Example: `-md 1`'
                        );
                    }

                    const tournament =
                        await Tournament.findOne({
                            guildId:
                                message.guildId,

                            isActive:
                                true,

                            status:
                                'complete'
                        });

                    if (!tournament) {

                        return message.reply(
                            '❌ No active completed tournament workspace found. Use `-tourney open <name>` first!'
                        );
                    }

                    if (
                        targetDayNum < 1 ||
                        targetDayNum >
                        tournament.totalMatchdays
                    ) {

                        return message.reply(
                            `❌ Invalid matchday. This tournament has exactly **${tournament.totalMatchdays}** matchdays.`
                        );
                    }

                    const matchdayData =
                        tournament.fixtures.get(
                            `day_${targetDayNum}`
                        );

                    if (!matchdayData) {

                        return message.reply(
                            '❌ Error fetching matchday compilation structure.'
                        );
                    }

                    // Calculate the exact same deadline timestamp used by the fixture engine
                    const deadlineTimestamp =
                        getMatchdayDeadlineTimestamp(
                            targetDayNum,
                            tournament
                        );

                    const matchdayEmbed =
                        new EmbedBuilder()
                            .setTitle(
                                `🏆 ${tournament.name}`
                            )
                            .setDescription(
                                `📅 **Matchday ${targetDayNum}**`
                            )
                            .setColor(
                                '#2ECC71'
                            )
                            .setFooter({
                                text: `⏰ Complete matches by: ${new Date(deadlineTimestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`
                            })
                            .setTimestamp();

                    Object.keys(
                        matchdayData
                    ).forEach(
                        groupName => {

                            let fixtureLines =
                                '';

                            matchdayData[
                                groupName
                            ].forEach(
                                match => {

                                    const homeRole =
                                        extractRole(
                                            match.home
                                        );

                                    const awayRole =
                                        extractRole(
                                            match.away
                                        );

                                    const homeStadium =
                                        extractChannel(
                                            match.home
                                        );

                                    const awayStadium =
                                        extractChannel(
                                            match.away
                                        );

                                    const assignedStadium =
                                        chooseStadium(
                                            homeStadium,
                                            awayStadium
                                        );

                                    fixtureLines +=
                                        `⚽ **Match ${match.displayId}:** ` +
                                        `${homeRole} vs ${awayRole} in ${assignedStadium}\n`;
                                }
                            );

                            if (
                                fixtureLines.length >
                                0
                            ) {

                                matchdayEmbed.addFields({
                                    name:
                                        `Group ${groupName.toUpperCase()}`,

                                    value:
                                        fixtureLines
                                });
                            }
                        }
                    );

                    // We also append the clickable Discord style timestamp directly into the text content reply 
                    // so players can easily read it on mobile devices without relying on embed rendering
                    return message.reply({
                        content: `⏳ **Matchday Deadline:** <t:${deadlineTimestamp}:F>`,
                        embeds: [
                            matchdayEmbed
                        ]
                    });
                }


                // ==========================================
                // 2. FIXTURE COMMAND
                // ==========================================

                if (
                    baseCommand === 'fixture'
                ) {

                    const fixtureType =
                        args[0]
                            ?.toLowerCase();

                    const tournament =
                        await Tournament.findOne({
                            guildId:
                                message.guildId,

                            isActive:
                                true,

                            status:
                                'complete'
                                .setTitle(
                                    `📌 Match ${requestedMatchNumber} Reserved`
                                )
                                .setDescription(
                                    `**${homeRole}** vs **${awayRole}**\n\n` +
                                    `This match has been moved to the **Reserved Matches** list.`
                                )
                                .setColor(
                                    '#F1C40F'
                                )
                                .setTimestamp();

                    return message.reply({
                        embeds: [
                            reserveEmbed
                        ]
                    });
                }

                // ==========================================
                // 4. PANEL COMMAND
                // ==========================================

                if (
                    baseCommand === 'panel'
                ) {

                    const tournament =
                        await Tournament.findOne({
                            guildId:
                                message.guildId,

                            isActive:
                                true,

                            status:
                                'complete'
                        });

                    if (!tournament) {

                        return message.reply(
                            '❌ No active completed tournament workspace found.'
                        );
                    }

                    const panelAction =
                        args[0]
                            ?.toLowerCase();

                    // ==========================================
                    // -panel
                    // ==========================================

                    if (!panelAction) {

                        const panelEmbed =
                            new EmbedBuilder()
                                .setTitle(
                                    `⚙️ Tournament Settings — ${tournament.name}`
                                )
                                .setColor(
                                    '#3498DB'
                                )
                                .addFields(
                                    {
                                        name:
                                            '🏏 Overs',

                                        value:
                                            `\`${tournament.overs ?? 20}\` overs`
                                    },
                                    {
                                        name:
                                            '🔄 Reps',

                                        value:
                                            `\`${tournament.reps ?? 'allowed'}\``
                                    },
                                    {
                                        name:
                                            '📅 Fixture Deadline',

                                        value:
                                            `\`${tournament.fixtureDeadlineDays ?? tournament.fd ?? 1}\` day(s)`
                                    },
                                    {
                                        name:
                                            '🏁 Reserve Deadline',

                                        value:
                                            `\`${tournament.reserveDeadlineDays ?? tournament.rd ?? 2}\` day(s)`
                                    }
                                )
                                .setFooter({
                                    text:
                                        'Use -panel overs, -panel reps, -panel fd or -panel rd to change settings.'
                                })
                                .setTimestamp();

                        return message.reply({
                            embeds: [
                                panelEmbed
                            ]
                        });
                    }

                    // ==========================================
                    // -panel overs <number>
                    // ==========================================

                    if (
                        panelAction ===
                        'overs'
                    ) {

                        const overs =
                            parseInt(
                                args[1],
                                10
                            );

                        if (
                            !Number.isInteger(
                                overs
                            ) ||
                            overs < 1 ||
                            overs > 50
                        ) {

                            return message.reply(
                                '❌ Please provide a valid number of overs between **1 and 50**.'
                            );
                        }

                        tournament.overs =
                            overs;

                        await tournament.save();

                        return message.reply(
                            `✅ Tournament overs have been changed to **${overs}**.`
                        );
                    }

                    // ==========================================
                    // -panel reps <allowed/not allowed>
                    // ==========================================

                    if (
                        panelAction ===
                        'reps'
                    ) {

                        const reps =
                            args
                                .slice(1)
                                .join(' ')
                                .toLowerCase();

                        if (
                            reps !==
                                'allowed' &&
                            reps !==
                                'not allowed'
                        ) {

                            return message.reply(
                                '❌ Please use either `allowed` or `not allowed`.\nExample: `-panel reps allowed`'
                            );
                        }

                        tournament.reps =
                            reps;

                        await tournament.save();

                        return message.reply(
                            `✅ Player reps are now **${reps}**.`
                        );
                    }

                    // ==========================================
                    // -panel fd <days>
                    // ==========================================

                    if (
                        panelAction ===
                        'fd'
                    ) {

                        const days =
                            parseInt(
                                args[1],
                                10
                            );

                        if (
                            !Number.isInteger(
                                days
                            ) ||
                            days < 1
                        ) {

                            return message.reply(
                                '❌ Please provide a valid number of days.'
                            );
                        }

                        tournament.fixtureDeadlineDays =
                            days;

                        tournament.fd =
                            days;

                        await tournament.save();

                        return message.reply(
                            `✅ Fixture deadline has been changed to **${days} day(s)**.`
                        );
                    }

                    // ==========================================
                    // -panel rd <days>
                    // ==========================================

                    if (
                        panelAction ===
                        'rd'
                    ) {

                        const days =
                            parseInt(
                                args[1],
                                10
                            );

                        if (
                            !Number.isInteger(
                                days
                            ) ||
                            days < 1
                        ) {

                            return message.reply(
                                '❌ Please provide a valid number of days.'
                            );
                        }

                        tournament.reserveDeadlineDays =
                            days;

                        tournament.rd =
                            days;

                        await tournament.save();

                        return message.reply(
                            `✅ Reserve deadline has been changed to **${days} day(s)**.`
                        );
                    }

                    return message.reply(
                        '❌ Unknown panel setting.\nUse `-panel` to view the available settings.'
                    );
                }

                // ==========================================
                // 5. TOURNEY COMMAND
                // ==========================================

                if (
                    baseCommand === 'tourney'
                ) {

                    const action =
                        args[0]
                            ?.toLowerCase();

                    // ==========================================
                    // -tourney cancel
                    // ==========================================

                    if (
                        action ===
                        'cancel'
                    ) {

                        if (
                            !activeSetup
                        ) {

                            return message.reply(
                                '❌ There is no active tournament setup to cancel.'
                            );
                        }

                        await Tournament.deleteOne({
                            _id:
                                activeSetup._id
                        });

                        return message.reply(
                            '✅ The active tournament setup has been cancelled.'
                        );
                    }

                    // ==========================================
                    // -tourney all
                    // ==========================================

                    if (
                        action ===
                        'all'
                    ) {

                        const tournaments =
                            await Tournament.find({
                                guildId:
                                    message.guildId
                            })
                            .sort({
                                createdAt:
                                    1
                            });

                        if (
                            tournaments.length ===
                            0
                        ) {

                            return message.reply(
                                '📭 No tournaments have been created in this server yet.'
                            );
                        }

                        const tournamentList =
                            tournaments
                                .map(
                                    (
                                        tournament,
                                        index
                                    ) => {

                                        const active =
                                            tournament.isActive
                                                ? ' 🟢 **ACTIVE**'
                                                : '';

                                        const status =
                                            tournament.status ||
                                            'unknown';

                                        return (
                                            `${index + 1}. **${tournament.name}** — ` +
                                            `${status}${active}`
                                        );
                                    }
                                )
                                .join('\n');

                        return message.reply(
                            `# 🏆 Tournament Registry\n\n${tournamentList}`
                        );
                    }

                    // ==========================================
                    // -tourney reset
                    // ==========================================

                    if (
                        action ===
                        'reset'
                    ) {

                        if (
                            !(await hasBotAdminAccess(
                                message.author.id
                            ))
                        ) {

                            return message.reply(
                                '❌ Only the **Bot Owner** or a **Bot Admin** can reset tournament data.'
                            );
                        }

                        const deleted =
                            await Tournament.deleteMany({
                                guildId:
                                    message.guildId
                            });

                        return message.reply(
                            `🗑️ Tournament database reset complete.\nDeleted **${deleted.deletedCount}** tournament record(s).`
                        );
                    }

                    // ==========================================
                    // -tourney open <name>
                    // ==========================================

                    if (
                        action ===
                        'open'
                    ) {

                        const tournamentName =
                            args
                                .slice(1)
                                .join(' ')
                                .trim();

                        if (!tournamentName) {

                            return message.reply(
                                '❌ Please provide the tournament name.\nExample: `-tourney open SNPL S6`'
                            );
                        }

                        const tournament =
                            await Tournament.findOne({
                                guildId:
                                    message.guildId,

                                name:
                                    tournamentName
                            });

                        if (!tournament) {

                            return message.reply(
                                `❌ Tournament **${tournamentName}** was not found.`
                            );
                        }

                        await Tournament.updateMany(
                            {
                                guildId:
                                    message.guildId,

                                _id: {
                                    $ne:
                                        tournament._id
                                }
                            },
                            {
                                $set: {
                                    isActive:
                                        false
                                }
                            }
                        );

                        tournament.isActive =
                            true;

                        await tournament.save();

                        return message.reply(
                            `✅ **${tournament.name}** is now the active tournament.`
                        );
                    }

                    // ==========================================
                    // -tourney make <name>
                    // ==========================================

                    if (
                        action ===
                        'make'
                    ) {

                        const tournamentName =
                            args
                                .slice(1)
                                .join(' ')
                                .trim();

                        if (!tournamentName) {

                            return message.reply(
                                '❌ Please provide a tournament name.\nExample: `-tourney make SNPL S6`'
                            );
                        }

                        const existing =
                            await Tournament.findOne({
                                guildId:
                                    message.guildId,

                                name:
                                    tournamentName
                            });

                        if (existing) {

                            return message.reply(
                                `❌ A tournament named **${tournamentName}** already exists in this server.`
                            );
                        }

                        const newTournament =
                            new Tournament({
                                guildId:
                                    message.guildId,

                                channelId:
                                    message.channelId,

                                name:
                                    tournamentName,

                                status:
                                    'setup',

                                isActive:
                                    false
                            });

                        await newTournament.save();

                        return message.reply(
                            `✅ Tournament **${tournamentName}** has been created.\n\n` +
                            `The tournament setup manager is ready to continue configuration.`
                        );
                    }

                    return message.reply(
                        '❌ Unknown tournament command.\nUse `-help` to view the available commands.'
                    );
                }

                // ==========================================
                // UNKNOWN COMMAND
                // ==========================================

                return;
            }

            // ==========================================
            // NON-PREFIX SETUP HANDLER
            // ==========================================

            if (
                activeSetup &&
                activeSetup.status !==
                    'complete'
            ) {

                // ==========================================
                // ACTIVE TOURNAMENT SETUP
                // ==========================================

                const setupStep =
                    activeSetup.setupStep;

                if (
                    setupStep ===
                    'name'
                ) {

                    activeSetup.name =
                        message.content.trim();

                    activeSetup.setupStep =
                        'teams';

                    await activeSetup.save();

                    return message.reply(
                        `✅ Tournament name set to **${activeSetup.name}**.\n\n` +
                        `Now provide the teams, one per line.`
                    );
                }

                if (
                    setupStep ===
                    'teams'
                ) {

                    const teams =
                        message.content
                            .split('\n')
                            .map(
                                team =>
                                    team.trim()
                            )
                            .filter(
                                Boolean
                            );

                    if (
                        teams.length <
                        2
                    ) {

                        return message.reply(
                            '❌ Please provide at least **2 teams**, one per line.'
                        );
                    }

                    activeSetup.teams =
                        teams;

                    activeSetup.setupStep =
                        'groups';

                    await activeSetup.save();

                    return message.reply(
                        `✅ **${teams.length} teams** added.\n\n` +
                        `Now provide the number of groups.`
                    );
                }

                if (
                    setupStep ===
                    'groups'
                ) {

                    const groups =
                        parseInt(
                            message.content.trim(),
                            10
                        );

                    if (
                        !Number.isInteger(
                            groups
                        ) ||
                        groups < 1
                    ) {

                        return message.reply(
                            '❌ Please provide a valid number of groups.'
                        );
                    }

                    if (
                        groups >
                        activeSetup.teams.length
                    ) {

                        return message.reply(
                            '❌ The number of groups cannot exceed the number of teams.'
                        );
                    }

                    activeSetup.groupCount =
                        groups;

                    activeSetup.setupStep =
                        'overs';

                    await activeSetup.save();

                    return message.reply(
                        `✅ Number of groups set to **${groups}**.\n\n` +
                        `Now provide the number of overs per match.`
                    );
                }

                if (
                    setupStep ===
                    'overs'
                ) {

                    const overs =
                        parseInt(
                            message.content.trim(),
                            10
                        );

                    if (
                        !Number.isInteger(
                            overs
                        ) ||
                        overs < 1 ||
                        overs > 50
                    ) {

                        return message.reply(
                            '❌ Please provide a valid number of overs between **1 and 50**.'
                        );
                    }

                    activeSetup.overs =
                        overs;

                    activeSetup.setupStep =
                        'reps';

                    await activeSetup.save();

                    return message.reply(
                        `✅ Overs set to **${overs}**.\n\n` +
                        `Are player replacements/reps **allowed** or **not allowed**?`
                    );
                }

                if (
                    setupStep ===
                    'reps'
                ) {

                    const reps =
                        message.content
                            .trim()
                            .toLowerCase();

                    if (
                        reps !==
                            'allowed' &&
                        reps !==
                            'not allowed'
                    ) {

                        return message.reply(
                            '❌ Please reply with exactly **allowed** or **not allowed**.'
                        );
                    }

                    activeSetup.reps =
                        reps;

                    activeSetup.setupStep =
                        'fixtureDeadline';

                    await activeSetup.save();

                    return message.reply(
                        `✅ Reps are **${reps}**.\n\n` +
                        `How many days should teams have to complete each matchday?`
                    );
                }

                if (
                    setupStep ===
                    'fixtureDeadline'
                ) {

                    const days =
                        parseInt(
                            message.content.trim(),
                            10
                        );

                    if (
                        !Number.isInteger(
                            days
                        ) ||
                        days < 1
                    ) {

                        return message.reply(
                            '❌ Please provide a valid number of days.'
                        );
                    }

                    activeSetup.fixtureDeadlineDays =
                        days;

                    activeSetup.fd =
                        days;

                    activeSetup.setupStep =
                        'reserveDeadline';

                    await activeSetup.save();

                    return message.reply(
                        `✅ Matchday deadline set to **${days} day(s)**.\n\n` +
                        `How many days should be allowed for reserved matches?`
                    );
                }

                if (
                    setupStep ===
                    'reserveDeadline'
                ) {

                    const days =
                        parseInt(
                            message.content.trim(),
                            10
                        );

                    if (
                        !Number.isInteger(
                            days
                        ) ||
                        days < 1
                    ) {

                        return message.reply(
                            '❌ Please provide a valid number of days.'
                        );
                    }

                    activeSetup.reserveDeadlineDays =
                        days;

                    activeSetup.rd =
                        days;

                    activeSetup.setupStep =
                        'complete';

                    activeSetup.status =
                        'complete';

                    activeSetup.isActive =
                        true;

                    await Tournament.updateMany(
                        {
                            guildId:
                                message.guildId,

                            _id: {
                                $ne:
                                    activeSetup._id
                            }
                        },
                        {
                            $set: {
                                isActive:
                                    false
                            }
                        }
                    );

                    await activeSetup.save();

                    return message.reply(
                        `✅ Reserve deadline set to **${days} day(s)**.\n\n` +
                        `🎉 **Tournament setup is complete!**\n` +
                        `Tournament **${activeSetup.name}** is now active.`
                    );
                }
            }

        } catch (error) {

            console.error(
                'Message handler error:',
                error
            );

            return message.reply(
                '❌ An unexpected error occurred while processing that command.'
            )
                .catch(
                    () => {}
                );
        }
    }
);

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function extractRole(value) {

    if (!value) {
        return 'Unknown Team';
    }

    const match =
        String(value).match(
            /<@&(\d+)>/
        );

    if (match) {
        return `<@&${match[1]}>`;
    }

    return String(value);
}

function extractChannel(value) {

    if (!value) {
        return 'Unknown Stadium';
    }

    const match =
        String(value).match(
            /<#(\d+)>/
        );

    if (match) {
        return `<#${match[1]}>`;
    }

    return String(value);
}

function chooseStadium(
    homeStadium,
    awayStadium
) {

    if (
        homeStadium &&
        homeStadium !==
            'Unknown Stadium'
    ) {

        return homeStadium;
    }

    if (
        awayStadium &&
        awayStadium !==
            'Unknown Stadium'
    ) {

        return awayStadium;
    }

    return 'TBD';
}

function getNumericMatchId(
    matchId
) {

    if (!matchId) {
        return 0;
    }

    const match =
        String(matchId).match(
            /(\d+)$/
        );

    if (!match) {
        return 0;
    }

    return parseInt(
        match[1],
        10
    );
}

function getDisplayIdFromMatchId(
    matchId,
    tournament
) {

    if (
        tournament &&
        tournament.matchRegistry
    ) {

        const registryMatch =
            tournament.matchRegistry.get(
                matchId
            );

        if (
            registryMatch &&
            registryMatch.displayId
        ) {

            return registryMatch.displayId;
        }
    }

    return getNumericMatchId(
        matchId
    );
}
                            .setTitle(
                                '📌 Match Reserved'
                            )
                            .setColor(
                                '#F1C40F'
                            )
                            .setDescription(
                                `**Match ${requestedMatchNumber}** has been successfully reserved.`
                            )
                            .addFields(
                                {
                                    name:
                                        'Match',

                                    value:
                                        `${homeRole} vs ${awayRole}`,

                                    inline:
                                        false
                                },
                                {
                                    name:
                                        'Original Matchday',

                                    value:
                                        `Matchday ${foundMatch.day}`,

                                    inline:
                                        true
                                },
                                {
                                    name:
                                        'Group',

                                    value:
                                        `Group ${foundMatch.group.toUpperCase()}`,

                                    inline:
                                        true
                                }
                            )
                            .setFooter({
                                text:
                                    `Reserve deadline: ${tournament.reserveDeadlineDays ?? 2} day(s) after final matchday`
                            })
                            .setTimestamp();

                    return message.reply({
                        embeds: [
                            reserveEmbed
                        ]
                    });
                }

                // ==========================================
                // 4. TOURNAMENT MANAGEMENT
                // ==========================================

                if (
                    baseCommand === 'tourney'
                ) {

                    const subCommand =
                        args
                            .shift()
                            ?.toLowerCase();

                    if (!subCommand) {

                        return message.reply(
                            '❌ **Invalid Usage:** Use `-tourney make`, `-tourney all`, `-tourney open`, or `-tourney cancel`.'
                        );
                    }

                    // ==========================================
                    // RESET ALL TOURNAMENTS
                    // -tourney reset
                    // ==========================================

                    if (subCommand === 'reset') {

                        const result =
                            await Tournament.deleteMany({
                                guildId:
                                    message.guildId
                            });

                        return message.reply(
                            `🗑️ **Tournament Database Reset Complete!**\n\n` +
                            `Deleted **${result.deletedCount}** tournament(s) from this server.\n\n` +
                            `There is now **no tournament workspace** available.`
                        );
                    }

                    // ==========================================
                    // CREATE
                    // ==========================================

                    if (
                        subCommand === 'make'
                    ) {

                        const tourneyName =
                            args.join(' ');

                        if (!tourneyName) {

                            return message.reply(
                                '❌ **Error:** Please provide a name for the tournament.\n' +
                                'Example: `-tourney make Champions Cup`'
                            );
                        }

                        const existing =
                            await Tournament.findOne({
                                guildId:
                                    message.guildId,

                                name:
                                    tourneyName
                            });

                        if (existing) {

                            return message.reply(
                                '⚠️ A tournament with that name already exists in this server!'
                            );
                        }

                        await Tournament.deleteMany({
                            guildId:
                                message.guildId,

                            status: {
                                $ne:
                                    'complete'
                            }
                        });

                        await Tournament.create({
                            guildId:
                                message.guildId,

                            channelId:
                                message.channelId,

                            name:
                                tourneyName,

                            status:
                                'setup_teams',

                            setupUser:
                                message.author.id,

                            isActive:
                                false,

                            liveDraws:
                                false,

                            drawGroups:
                                {},

                            drawRevealState:
                                {},

                            overs:
                                20,

                            reps:
                                'allowed',

                            firstDayDeadlineDays:
                                1,

                            reserveDeadlineDays:
                                2,

                            startDate:
                                null
                        });

                        return message.reply(
                            `🏆 **Creating Tournament: "${tourneyName}"**\n` +
                            'Enter your teams (pinging them) and their stadiums:\n' +
                            '🔹 **Format:** `@TeamRole #stadium-channel, @TeamRole2 #stadium-channel2`\n\n' +
                            '*(Type `-tourney cancel` at any point to abort the wizard)*'
                        );
                    }

                    // ==========================================
                    // ALL
                    // ==========================================

                    if (
                        subCommand === 'all'
                    ) {

                        const tournaments =
                            await Tournament.find({
                                guildId:
                                    message.guildId
                            });

                        if (
                            tournaments.length ===
                            0
                        ) {

                            return message.reply(
                                '📭 **No tournaments found.** Use `-tourney make <name>` to create one!'
                            );
                        }

                        const allEmbed =
                            new EmbedBuilder()
                                .setTitle(
                                    '📋 Server Tournament Registry'
                                )
                                .setColor(
                                    '#3498DB'
                                )
                                .setTimestamp();

                        let descriptionText =
                            '';

                        tournaments.forEach(
                            (
                                tourney,
                                index
                            ) => {

                                const statusIcon =
                                    tourney.isActive
                                        ? '🟩 **[Active Workspace]**'
                                        : '⬜ *[Idle]*';

                                descriptionText +=
                                    `${index + 1}. **${tourney.name}** ── ${statusIcon}\n` +
                                    `Status: \`${tourney.status}\`\n\n`;
                            }
                        );

                        allEmbed.setDescription(
                            descriptionText
                        );

                        return message.reply({
                            embeds: [
                                allEmbed
                            ]
                        });
                    }

                    // ==========================================
                    // OPEN
                    // ==========================================

                    if (
                        subCommand === 'open'
                    ) {

                        const targetName =
                            args.join(' ');

                        if (!targetName) {

                            return message.reply(
                                '❌ **Error:** Please specify the tournament name to open.\n' +
                                'Example: `-tourney open Champions Cup`'
                            );
                        }

                        const targetTourney =
                            await Tournament.findOne({
                                guildId:
                                    message.guildId,

                                name:
                                    targetName
                            });

                        if (!targetTourney) {

                            return message.reply(
                                `❌ **Error:** No tournament named "${targetName}" was found.`
                            );
                        }

                        await Tournament.updateMany(
                            {
                                guildId:
                                    message.guildId
                            },
                            {
                                isActive:
                                    false
                            }
                        );

                        targetTourney.isActive =
                            true;

                        await targetTourney.save();

                        return message.reply(
                            `🟩 **Workspace Switched!**\n` +
                            `Tournament **"${targetName}"** is now loaded as your active workspace.`
                        );
                    }

                    // ==========================================
                    // CANCEL
                    // ==========================================

                    if (
                        subCommand === 'cancel'
                    ) {

                        if (!activeSetup) {

                            return message.reply(
                                '❌ There is no active tournament setup wizard running in this channel.'
                            );
                        }

                        await Tournament.deleteOne({
                            guildId:
                                message.guildId,

                            channelId:
                                message.channelId,

                            status: {
                                $ne:
                                    'complete'
                            }
                        });

                        return message.reply(
                            '🛑 **Tournament Setup Cancelled.** Configuration state wiped.'
                        );
                    }

                    return message.reply(
                        '❌ Unknown tournament subcommand.'
                    );
                }

                // ==========================================
                // -annc <TIME> COMMAND
                // Example: -annc 7:30PM
                // ==========================================

                if (baseCommand === 'annc') {

                    const timeInput =
                        args.join(' ').trim();

                    if (!timeInput) {

                        return message.reply(
                            '❌ **Usage Error:** Provide a target launch time.\nExample: `-annc 7:30PM`'
                        );
                    }

                    // Look up active tournament mapping configuration
                    const tournament =
                        await Tournament.findOne({
                            guildId:
                                message.guildId,

                            isActive:
                                true,

                            status:
                                'complete'
                        });

                    if (!tournament) {

                        return message.reply(
                            '❌ No active completed tournament workspace currently found in this server.'
                        );
                    }

                    // SEARCH FOR A MATCH ASSIGNED TO THIS SPECIFIC STADIUM CHANNEL

                    let activeMatch =
                        null;

                    let activeMatchId =
                        null;

                    for (
                        const [
                            matchId,
                            registryMatch
                        ]
                        of tournament.matchRegistry.entries()
                    ) {

                        const homeChan =
                            extractChannel(
                                registryMatch.home
                            );

                        const awayChan =
                            extractChannel(
                                registryMatch.away
                            );

                        // Check if the current channel matches either home or away stadium configuration

                        if (
                            homeChan ===
                                `<#${message.channelId}>` ||
                            awayChan ===
                                `<#${message.channelId}>`
                        ) {

                            activeMatch =
                                registryMatch;

                            activeMatchId =
                                matchId;

                            break;
                        }
                    }

                    if (!activeMatch) {

                        return message.reply(
                            '❌ **Error:** No match registry data is configured for this stadium channel.'
                        );
                    }

                    // PARSE TIME STRING
                    // Assumes India Standard Time context per deadline parameters

                    const timeRegex =
                        /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

                    const matchTimeParts =
                        timeInput.match(
                            timeRegex
                        );

                    if (!matchTimeParts) {

                        return message.reply(
                            '❌ **Invalid Time Format!** Use `HH:MM AM/PM` configuration layout.\nExample: `-annc 7:30PM`'
                        );
                    }

                    let hours =
                        parseInt(
                            matchTimeParts[1],
                            10
                        );

                    const minutes =
                        parseInt(
                            matchTimeParts[2],
                            10
                        );

                    const ampm =
                        matchTimeParts[3]
                            .toUpperCase();

                    if (
                        ampm === 'PM' &&
                        hours < 12
                    ) {
                        hours += 12;
                    }

                    if (
                        ampm === 'AM' &&
                        hours === 12
                    ) {
                        hours = 0;
                    }

                    // Form target processing timestamp date bound inside local server frame

                    const now =
                        new Date();

                    const targetUnlockDate =
                        new Date(
                            now.getFullYear(),
                            now.getMonth(),
                            now.getDate(),
                            hours,
                            minutes,
                            0
                        );

                    // If user provides a time that has already passed today, assume they mean tomorrow

                    if (
                        targetUnlockDate <=
                        now
                    ) {

                        targetUnlockDate.setDate(
                            targetUnlockDate.getDate() +
                            1
                        );
                    }

                    const targetTimestamp =
                        Math.floor(
                            targetUnlockDate.getTime() /
                            1000
                        );

                    // LOCK CHANNEL PERMISSIONS IMMEDIATELY

                    await message.channel.permissionOverwrites
                        .edit(
                            message.guild.roles.everyone,
                            {
                                SendMessages:
                                    false
                            }
                        )
                        .catch(
                            err => {

                                console.error(
                                    err
                                );

                                return message.reply(
                                    '❌ Failed to lock this channel. Ensure the bot has **Manage Channels** or **Manage Roles** permissions.'
                                );
                            }
                        );

                    // SAVE THE ACTION LOG TO THE DATABASE ARRAY

                    if (
                        !tournament.scheduledMatches
                    ) {
                        tournament.scheduledMatches =
                            [];
                    }

                    const homeRole =
                        extractRole(
                            activeMatch.home
                        );

                    const awayRole =
                        extractRole(
                            activeMatch.away
                        );

                    tournament.scheduledMatches.push({
                        matchId:
                            activeMatchId,

                        channelId:
                            message.channelId,

                        unlockAt:
                            targetUnlockDate,

                        homeRole:
                            homeRole,

                        awayRole:
                            awayRole,

                        triggered:
                            false
                    });

                    tournament.markModified(
                        'scheduledMatches'
                    );

                    await tournament.save();

                    // REMOVE ADMINISTRATIVE TRIGGER MESSAGE

                    await message.delete()
                        .catch(
                            () => null
                        );

                    // BROADCAST CUSTOMIZED LAUNCH PREVIEW

                    return message.channel.send(
                        `## ${homeRole} **vs** ${awayRole}\n` +
                        `### Kick-off Time: <t:${targetTimestamp}:F>\n` +
                        `🔒 *Stadium Locked*`
                    );
                }

                // ==========================================
                // 5. PANEL COMMAND
                // ==========================================

                if (
                    baseCommand === 'panel'
                ) {

                    const panelType =
                        args
                            .shift()
                            ?.toLowerCase();

                    const tournament =
                        await Tournament.findOne({
                            guildId:
                                message.guildId,

                            isActive:
                                true,

                            status:
                                'complete'
                        });

                    if (!tournament) {

                        return message.reply(
                            '❌ No active tournament workspace found.'
                        );
                    }

                    // ==========================================
                    // -panel
                    // ==========================================

                    if (!panelType) {

                        const panelEmbed =
                            new EmbedBuilder()
                                .setTitle(
                                    `⚙️ ${tournament.name} — Tournament Panel`
                                )
                                .setColor(
                                    '#3498DB'
                                )
                                .addFields(
                                    {
                                        name:
                                            '🏏 Match Overs',

                                        value:
                                            `**${tournament.overs ?? 20} Overs**`,

                                        inline:
                                            true
                                    },
                                    {
                                        name:
                                            '🔁 Reps',

                                        value:
                                            `**${capitalize(tournament.reps ?? 'allowed')}**`,

                                        inline:
                                            true
                                    },
                                    {
                                        name:
                                            '🌅 First Day Deadline',

                                        value:
                                            `**${tournament.firstDayDeadlineDays ?? 1} Day(s)**`,

                                        inline:
                                            true
                                    },
                                    {
                                        name:
                                            '📅 Reserve Deadline',

                                        value:
                                            `**${tournament.reserveDeadlineDays ?? 2} Day(s)** after the final matchday`,

                                        inline:
                                            false
                                    }
                                )
                                .setFooter({
                                    text:
                                        'Use -panel overs, -panel reps, -panel fd or -panel rd to change settings.'
                                })
                                .setTimestamp();

                        return message.reply({
                            embeds: [
                                panelEmbed
                            ]
                        });
                    }

                    // ==========================================
                    // -panel overs
                    // ==========================================

                    if (
                        panelType ===
                        'overs'
                    ) {

                        const overs =
                            parseInt(
                                args[0],
                                10
                            );

                        if (
                            isNaN(overs) ||
                            overs < 1 ||
                            overs > 1000
                        ) {

                            return message.reply(
                                '❌ Please enter a valid number of overs.'
                            );
                        }

                        tournament.overs =
                            overs;

                        await tournament.save();

                        const embed =
                            new EmbedBuilder()
                                .setTitle(
                                    '⚙️ Match Settings Updated'
                                )
                                .setColor(
                                    '#2ECC71'
                                )
                                .setDescription(
                                    `Match overs have been set to **${overs} overs**.`
                                )
                                .setTimestamp();

                        return message.reply({
                            embeds: [
                                embed
                            ]
                        });
                    }

                    // ==========================================
                    // -panel reps
                    // ==========================================

                    if (
                        panelType ===
                        'reps'
                    ) {

                        const repsInput =
                            args
                                .join(' ')
                                .toLowerCase()
                                .trim();

                        if (
                            repsInput !==
                                'allowed' &&
                            repsInput !==
                                'not allowed'
                        ) {

                            return message.reply(
                                '❌ Please use either `allowed` or `not allowed`.\n' +
                                'Example: `-panel reps allowed`'
                            );
                        }

                        tournament.reps =
                            repsInput;

                        await tournament.save();

                        const embed =
                            new EmbedBuilder()
                                .setTitle(
                                    '⚙️ Match Settings Updated'
                                )
                                .setColor(
                                    '#2ECC71'
                                )
                                .setDescription(
                                    `Reps have been set to **${repsInput.toUpperCase()}**.`
                                )
                                .setTimestamp();

                        return message.reply({
                            embeds: [
                                embed
                            ]
                        });
                    }

                    // ==========================================
                    // -panel rd
                    // ==========================================

                    if (
                        panelType ===
                        'rd'
                    ) {

                        const days =
                            parseInt(
                                args[0],
                                10
                            );

                        if (
                            isNaN(days) ||
                            days < 0 ||
                            days > 30
                        ) {

                            return message.reply(
                                '❌ Please enter a valid reserve deadline between **0 and 30 days**.'
                            );
                        }

                        tournament.reserveDeadlineDays =
                            days;

                        await tournament.save();

                        const embed =
                            new EmbedBuilder()
                                .setTitle(
                                    '⚙️ Reserve Deadline Updated'
                                )
                                .setColor(
                                    '#2ECC71'
                                )
                                .setDescription(
                                    `Reserved matches can now be completed within **${days} day(s)** after the final matchday.`
                                )
                                .setTimestamp();

                        return message.reply({
                            embeds: [
                                embed
                            ]
                        });
                    }

                    // ==========================================
                    // -panel fd
                    // ==========================================

                    if (
                        panelType ===
                        'fd'
                    ) {

                        const days =
                            parseInt(
                                args[0],
                                10
                            );

                        if (
                            isNaN(days) ||
                            days < 1 ||
                            days > 30
                        ) {

                            return message.reply(
                                '❌ Please enter a valid first-day deadline between **1 and 30 days**.'
                            );
                        }

                        tournament.firstDayDeadlineDays =
                            days;

                        await tournament.save();

                        const embed =
                            new EmbedBuilder()
                                .setTitle(
                                    '🌅 First Day Deadline Updated'
                                )
                                .setColor(
                                    '#2ECC71'
                                )
                                .setDescription(
                                    `Matchday 1 now has a **${days} day(s)** deadline.`
                                )
                                .addFields({
                                    name:
                                        'Deadline',

                                    value:
                                        days === 1
                                            ? 'Normal 1-day deadline'
                                            : `${days} full day(s) are available for Matchday 1.`
                                })
                                .setTimestamp();

                        return message.reply({
                            embeds: [
                                embed
                            ]
                        });
                    }

                    return message.reply(
                        '❌ Unknown panel setting.\n' +
                        'Use:\n' +
                        '`-panel`\n' +
                        '`-panel overs <number>`\n' +
                        '`-panel reps <allowed/not allowed>`\n' +
                        '`-panel fd <days>`\n' +
                        '`-panel rd <days>`'
                    );
                }
            }

            // ==========================================
            // INTERACTIVE TOURNAMENT WIZARD
            // ==========================================

            if (
                !activeSetup ||
                activeSetup.status ===
                    'complete'
            ) {

                return;
            }

            if (
                message.author.id !==
                activeSetup.setupUser
            ) {
                return;
            }

            const rawInput =
                message.content.trim();

            // ==========================================
            // STEP A
            // TEAMS + STADIUMS
            // ==========================================

            if (
                activeSetup.status ===
                'setup_teams'
            ) {

                const entries =
                    rawInput
                        .split(',')
                        .map(
                            item =>
                                item.trim()
                        )
                        .filter(
                            item =>
                                item.length > 0
                        );

                const validatedTeams =
                    [];

                for (
                    const entry of entries
                ) {

                    const roleMatch =
                        entry.match(
                            /<@&(\d+)>/
                        );

                    const channelMatch =
                        entry.match(
                            /<#(\d+)>/
                        );

                    if (
                        !roleMatch ||
                        !channelMatch
                    ) {

                        return message.reply(
                            `❌ **Parsing Error:** One of your entries is invalid: \`${entry}\`\n` +
                            'Please check formatting: `@TeamRole #stadium-channel, @TeamRole2 #stadium-channel2`'
                        );
                    }

                    validatedTeams.push(
                        `${roleMatch[0]} (${channelMatch[0]})`
                    );
                }

                if (
                    validatedTeams.length <
                    2
                ) {

                    return message.reply(
                        '❌ Please enter at least 2 distinct teams with their stadium channels.'
                    );
                }

                activeSetup.teamNames =
                    validatedTeams;

                activeSetup.teamsCount =
                    validatedTeams.length;

                activeSetup.status =
                    'setup_groups';

                await activeSetup.save();

                return message.reply(
                    `📝 Received **${validatedTeams.length}** teams and stadium channels successfully!\n` +
                    'How many Groups would you like to split them into?'
                );
            }

            // ==========================================
            // STEP B
            // GROUPS
            // ==========================================

            if (
                activeSetup.status ===
                'setup_groups'
            ) {

                const groups =
                    parseInt(
                        rawInput,
                        10
                    );

                if (
                    isNaN(groups) ||
                    groups < 1 ||
                    groups > 26
                ) {

                    return message.reply(
                        '❌ Please enter a valid number of groups (1-26).'
                    );
                }

                if (
                    groups >
                    activeSetup.teamsCount
                ) {

                    return message.reply(
                        '❌ You cannot have more groups than total registered teams!'
                    );
                }

                activeSetup.groupsCount =
                    groups;

                activeSetup.status =
                    'ask_draw_display';

                await activeSetup.save();

                return message.reply(
                    '🎲 **Live Draws:** Type **yes** if you want to use Live Group Draws, or **no** to reveal all groups immediately.'
                );
            }

            // ==========================================
            // STEP C
            // LIVE DRAW SELECTION
            // ==========================================

            if (
                activeSetup.status ===
                'ask_draw_display'
            ) {

                const choice =
                    rawInput.toLowerCase();

                if (
                    choice !== 'yes' &&
                    choice !== 'no'
                ) {

                    return message.reply(
                        '❌ Invalid choice. Please reply with **yes** or **no**.'
                    );
                }

                const alphabet =
                    'abcdefghijklmnopqrstuvwxyz'
                        .split('');

                // ==========================================
                // RANDOMIZE TEAMS ONCE
                // ==========================================

                const shuffledTeams =
                    [...activeSetup.teamNames]
                        .sort(
                            () =>
                                Math.random() - 0.5
                        );

                const temporaryGroups =
                    {};

                for (
                    let i = 0;
                    i <
                    activeSetup.groupsCount;
                    i++
                ) {

                    temporaryGroups[
                        alphabet[i]
                    ] = [];
                }

                shuffledTeams.forEach(
                    (
                        teamEntry,
                        index
                    ) => {

                        const groupLetter =
                            alphabet[
                                index %
                                activeSetup.groupsCount
                            ];

                        temporaryGroups[
                            groupLetter
                        ].push(
                            teamEntry
                        );
                    }
                );

                // IMPORTANT:
                // Keep teamNames in exactly the
                // same order as the generated groups.

                activeSetup.teamNames =
                    shuffledTeams;

                activeSetup.drawGroups =
                    temporaryGroups;

                // ==========================================
                // RESET REVEAL STATE
                // ==========================================

                const revealState =
                    {};

                Object.keys(
                    temporaryGroups
                ).forEach(
                    groupLetter => {

                        revealState[
                            groupLetter
                        ] = 0;
                    }
                );

                activeSetup.drawRevealState =
                    revealState;

                // ==========================================
                // LIVE DRAW = NO
                // REVEAL EVERYTHING
                // ==========================================

                if (
                    choice === 'no'
                ) {

                    activeSetup.liveDraws =
                        false;

                    // Mark every team revealed
                    // internally as well.

                    Object.keys(
                        temporaryGroups
                    ).forEach(
                        groupLetter => {

                            revealState[
                                groupLetter
                            ] =
                                temporaryGroups[
                                    groupLetter
                                ].length;
                        }
                    );

                    activeSetup.drawRevealState =
                        revealState;

                    activeSetup.status =
                        'setup_format';

                    await activeSetup.save();

                    let output =
                        '📊 **Group Draws**\n' +
                        `Tournament Name: **${activeSetup.name}**\n\n`;

                    Object.keys(
                        temporaryGroups
                    ).forEach(
                        groupLetter => {

                            output +=
                                `## Group ${groupLetter.toUpperCase()}\n`;

                            temporaryGroups[
                                groupLetter
                            ].forEach(
                                (
                                    team,
                                    index
                                ) => {

                                    output +=
                                        `${index + 1}. **${team}**\n`;
                                }
                            );

                            output += '\n';
                        }
                    );

                    output +=
                        '📊 **All groups have been revealed!**\n\n' +
                        'What is the tournament Format? Type **UCL** or **Round Robin**.';

                    return message.reply(
                        output
                    );
                }

                // ==========================================
                // LIVE DRAW = YES
                //
                // NO MANUAL DRAW QUESTION
                //
                // Immediately continue to format.
                // ==========================================

                activeSetup.liveDraws =
                    true;

                activeSetup.status =
                    'setup_format';

                await activeSetup.save();

                let hiddenOutput =
                    '🎲 **Live Group Draws enabled!**\n\n' +
                    `Tournament Name: **${activeSetup.name}**\n\n`;

                Object.keys(
                    temporaryGroups
                ).forEach(
                    groupLetter => {

                        hiddenOutput +=
                            `## Group ${groupLetter.toUpperCase()}\n`;

                        temporaryGroups[
                            groupLetter
                        ].forEach(
                            (
                                team,
                                index
                            ) => {

                                hiddenOutput +=
                                    `${index + 1}. 🔒 **Hidden**\n`;
                            }
                        );

                        hiddenOutput += '\n';
                    }
                );

                hiddenOutput +=
                    '🎲 **Live Draws are ready!**\n\n' +
                    'What is the tournament Format? Type **UCL** or **Round Robin**.';

                return message.reply(
                    hiddenOutput
                );
            }

            // ==========================================
            // STEP D
            // FORMAT
            // ==========================================

            if (
                activeSetup.status ===
                'setup_format'
            ) {

                const formatChoice =
                    rawInput.toLowerCase();

                if (
                    formatChoice ===
                        'ucl' ||
                    formatChoice.includes(
                        'ucl'
                    )
                ) {

                    activeSetup.format =
                        'ucl';

                    activeSetup.status =
                        'setup_ucl_matches';

                    await activeSetup.save();

                    return message.reply(
                        '🏆 **UCL Format Selected.**\n' +
                        'How many Matchdays would you like to schedule?'
                    );
                }

                if (
                    formatChoice ===
                        'round robin' ||
                    formatChoice.includes(
                        'round'
                    ) &&
                    formatChoice.includes(
                        'robin'
                    )
                ) {

                    activeSetup.format =
                        'round_robin';

                    activeSetup.status =
                        'setup_rr_rounds';

                    await activeSetup.save();

                    return message.reply(
                        '🔄 **Round Robin Selected.**\n' +
                        'Should it be a **Single** round robin or **Double** round robin?'
                    );
                }

                return message.reply(
                    '❌ Invalid choice. Please reply with **UCL** or **Round Robin**.'
                );
            }

            // ==========================================
            // STEP E-1
            // UCL FIXTURES
            // ==========================================

            if (
                activeSetup.status ===
                'setup_ucl_matches'
            ) {

                const matchesCount =
                    parseInt(
                        rawInput,
                        10
                    );

                if (
                    isNaN(matchesCount) ||
                    matchesCount < 1
                ) {

                    return message.reply(
                        '❌ Please enter a valid number of matches.'
                    );
                }

                activeSetup.totalMatchdays =
                    matchesCount;

                const generated =
                    generateUCLFixtures(
                        activeSetup.teamNames,
                        activeSetup.groupsCount,
                        matchesCount,
                        message.guildId
                    );

                await Tournament.updateMany(
                    {
                        guildId:
                            message.guildId
                    },
                    {
                        isActive:
                            false
                    }
                );

                activeSetup.fixtures =
                    generated.fixtures;

                activeSetup.matchRegistry =
                    generated.matchRegistry;

                activeSetup.status =
                    'complete';

                activeSetup.isActive =
                    true;

                activeSetup.startDate =
                    new Date();

                activeSetup.overs =
                    activeSetup.overs ??
                    20;

                activeSetup.reps =
                    activeSetup.reps ??
                    'allowed';

                activeSetup.firstDayDeadlineDays =
                    activeSetup.firstDayDeadlineDays ??
                    1;

                activeSetup.reserveDeadlineDays =
                    activeSetup.reserveDeadlineDays ??
                    2;

                // IMPORTANT:
                // liveDraws remains TRUE if
                // Live Draw was selected.

                await activeSetup.save();

                let generationMessage =
                    `✅ **Tournament "${activeSetup.name}" Generation Complete!** ` +
                    `Scheduled **${matchesCount}** matchdays.\n`;

                if (
                    activeSetup.liveDraws ===
                    true
                ) {

                    generationMessage +=
                        '🎲 **Live Draws are active.**\n' +
                        'Use **`-draw`** to view the current draw.\n' +
                        'Use **`-draw <group>`** to reveal one team from that group.\n' +
                        'Example: **`-draw A`**\n';
                }

                generationMessage +=
                    'Use **`-md 1`** to view the opening fixtures!';

                return message.reply(
                    generationMessage
                );
            }

            // ==========================================
            // STEP E-2
            // ROUND ROBIN
            // ==========================================

            if (
                activeSetup.status ===
                'setup_rr_rounds'
            ) {

                const input =
                    rawInput.toLowerCase();

                let totalRounds =
                    1;

                if (
                    input.includes(
                        'double'
                    )
                ) {

                    activeSetup.rounds =
                        'double';

                    totalRounds =
                        2;

                } else if (
                    input.includes(
                        'single'
                    )
                ) {

                    activeSetup.rounds =
                        'single';

                } else {

                    return message.reply(
                        '❌ Please reply with **Single** or **Double**.'
                    );
                }

                const teamsPerGroup =
                    Math.ceil(
                        activeSetup.teamsCount /
                        activeSetup.groupsCount
                    );

                const matchdaysPerRound =
                    teamsPerGroup % 2 === 0
                        ? teamsPerGroup - 1
                        : teamsPerGroup;

                const totalCalculatedMatchdays =
                    matchdaysPerRound *
                    totalRounds;

                activeSetup.totalMatchdays =
                    totalCalculatedMatchdays;

                const generated =
                    generateRoundRobinFixtures(
                        activeSetup.teamNames,
                        activeSetup.groupsCount,
                        totalRounds,
                        message.guildId
                    );

                await Tournament.updateMany(
                    {
                        guildId:
                            message.guildId
                    },
                    {
                        isActive:
                            false
                    }
                );

                activeSetup.fixtures =
                    generated.fixtures;

                activeSetup.matchRegistry =
                    generated.matchRegistry;

                activeSetup.status =
                    'complete';

                activeSetup.isActive =
                    true;

                activeSetup.startDate =
                    new Date();

                activeSetup.overs =
                    activeSetup.overs ??
                    20;

                activeSetup.reps =
                    activeSetup.reps ??
                    'allowed';

                activeSetup.firstDayDeadlineDays =
                    activeSetup.firstDayDeadlineDays ??
                    1;

                activeSetup.reserveDeadlineDays =
                    activeSetup.reserveDeadlineDays ??
                    2;

                await activeSetup.save();

                let generationMessage =
                    `✅ **Tournament "${activeSetup.name}" Generation Complete!** ` +
                    `Formulated **${totalCalculatedMatchdays}** unique matchdays.\n`;

                if (
                    activeSetup.liveDraws ===
                    true
                ) {

                    generationMessage +=
                        '🎲 **Live Draws are active.**\n' +
                        'Use **`-draw`** to view the current draw.\n' +
                        'Use **`-draw <group>`** to reveal one team from that group.\n' +
                        'Example: **`-draw A`**\n';
                }

                generationMessage +=
                    'Use **`-md 1`** to view the opening grid!';

                return message.reply(
                    generationMessage
                );
            }

        } catch (error) {

            console.error(
                'Message handler error:',
                error
            );

            return message.reply(
                '❌ An unexpected error occurred while processing the command.'
            );
        }
    }
);

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// ==========================================
// EXTRACT ROLE
// ==========================================

function extractRole(
    teamString
) {

    const match =
        teamString?.match(
            /<@&\d+>/
        );

    return match
        ? match[0]
        : teamString ||
            'TBD Team';
}

// ==========================================
// EXTRACT CHANNEL
// ==========================================

function extractChannel(
    teamString
) {

    const match =
        teamString?.match(
            /<#\d+>/
        );

    return match
        ? match[0]
        : null;
}

// ==========================================
// RANDOM STADIUM
// ==========================================

function chooseStadium(
    homeStadium,
    awayStadium
) {

    const stadiumPool =
        [
            homeStadium,
            awayStadium
        ].filter(Boolean);

    if (
        stadiumPool.length ===
        0
    ) {

        return '`TBD Stadium`';
    }

    return stadiumPool[
        Math.floor(
            Math.random() *
            stadiumPool.length
        )
    ];
}

// ==========================================
// CAPITALIZE
// ==========================================

function capitalize(
    text
) {

    if (!text) {
        return '';
    }

    return (
        text.charAt(0).toUpperCase() +
        text.slice(1)
    );
}

// ==========================================
// NUMERIC MATCH ID
// ==========================================

function getNumericMatchId(
    matchId
) {

    const parts =
        String(
            matchId
        ).split('_');

    const number =
        parseInt(
            parts[
                parts.length - 1
            ],
            10
        );

    return isNaN(number)
        ? 0
        : number;
}

// ==========================================
// FORMAT MATCH ID
// ==========================================

function formatMatchId(
    matchId
) {

    const numericId =
        getNumericMatchId(
            matchId
        );

    return `Match ${numericId}`;
}

// ==========================================
// FORMAT DATE
// ==========================================

function formatDate(
    date
) {

    if (!date) {
        return 'TBD';
    }

    const parsedDate =
        new Date(
            date
        );

    if (
        isNaN(
            parsedDate.getTime()
        )
    ) {

        return 'TBD';
    }

    return parsedDate.toLocaleDateString(
        'en-IN',
        {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }
    );
}

// ==========================================
// FORMAT TIME
// ==========================================

function formatTime(
    date
) {

    if (!date) {
        return 'TBD';
    }

    const parsedDate =
        new Date(
            date
        );

    if (
        isNaN(
            parsedDate.getTime()
        )
    ) {

        return 'TBD';
    }

    return parsedDate.toLocaleTimeString(
        'en-IN',
        {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }
    );
}

// ==========================================
// FORMAT DATE + TIME
// ==========================================

function formatDateTime(
    date
) {

    if (!date) {
        return 'TBD';
    }

    return `${formatDate(date)} at ${formatTime(date)}`;
}

// ==========================================
// SAFE NUMBER
// ==========================================

function safeNumber(
    value,
    fallback = 0
) {

    const number =
        Number(
            value
        );

    return Number.isFinite(
        number
    )
        ? number
        : fallback;
}

// ==========================================
// SAFE INTEGER
// ==========================================

function safeInteger(
    value,
    fallback = 0
) {

    const number =
        parseInt(
            value,
            10
        );

    return Number.isInteger(
        number
    )
        ? number
        : fallback;
}

// ==========================================
// TEAM DISPLAY NAME
// ==========================================

function getTeamDisplayName(
    teamString
) {

    if (!teamString) {
        return 'TBD Team';
    }

    const roleMatch =
        teamString.match(
            /<@&(\d+)>/
        );

    if (
        roleMatch &&
        message.guild
    ) {

        const role =
            message.guild.roles.cache.get(
                roleMatch[1]
            );

        if (role) {
            return role.name;
        }
    }

    return teamString
        .replace(
            /<@&\d+>/g,
            ''
        )
        .replace(
            /[()]/g,
            ''
        )
        .trim() ||
        'TBD Team';
}

// ==========================================
// GET GROUP LETTER
// ==========================================

function getGroupLetter(
    index
) {

    const alphabet =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    return alphabet[
        index
    ] || '?';
}

// ==========================================
// GET TEAM GROUP
// ==========================================

function getTeamGroup(
    teamName,
    groups
) {

    if (
        !groups ||
        typeof groups !== 'object'
    ) {

        return null;
    }

    for (
        const [
            group,
            teams
        ] of Object.entries(
            groups
        )
    ) {

        if (
            Array.isArray(
                teams
            ) &&
            teams.includes(
                teamName
            )
        ) {

            return group;
        }
    }

    return null;
}

// ==========================================
// FIND FIXTURE
// ==========================================

function findFixture(
    fixtures,
    matchId
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return null;
    }

    return fixtures.find(
        fixture =>
            String(
                fixture.matchId
            ) ===
            String(
                matchId
            )
    ) || null;
}

// ==========================================
// FIND MATCH BY NUMERIC ID
// ==========================================

function findMatchByNumericId(
    fixtures,
    numericId
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return null;
    }

    const target =
        safeInteger(
            numericId,
            -1
        );

    return fixtures.find(
        fixture =>
            getNumericMatchId(
                fixture.matchId
            ) === target
    ) || null;
}

// ==========================================
// MATCHDAY FIXTURES
// ==========================================

function getMatchdayFixtures(
    fixtures,
    matchday
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return [];
    }

    const target =
        safeInteger(
            matchday,
            -1
        );

    return fixtures.filter(
        fixture =>
            safeInteger(
                fixture.matchday,
                -1
            ) === target
    );
}

// ==========================================
// GROUP FIXTURES
// ==========================================

function getGroupFixtures(
    fixtures,
    group
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return [];
    }

    const target =
        String(
            group
        ).toLowerCase();

    return fixtures.filter(
        fixture =>
            String(
                fixture.group
            ).toLowerCase() ===
            target
    );
}

// ==========================================
// TEAM FIXTURES
// ==========================================

function getTeamFixtures(
    fixtures,
    team
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return [];
    }

    const target =
        String(
            team
        ).toLowerCase();

    return fixtures.filter(
        fixture => {

            const home =
                String(
                    fixture.homeTeam ||
                    fixture.home ||
                    ''
                ).toLowerCase();

            const away =
                String(
                    fixture.awayTeam ||
                    fixture.away ||
                    ''
                ).toLowerCase();

            return (
                home === target ||
                away === target
            );
        }
    );
}

// ==========================================
// FIXTURE STATUS
// ==========================================

function getFixtureStatus(
    fixture
) {

    if (!fixture) {
        return 'unknown';
    }

    if (
        fixture.completed ===
        true
    ) {

        return 'completed';
    }

    if (
        fixture.status
    ) {

        return String(
            fixture.status
        ).toLowerCase();
    }

    if (
        fixture.result
    ) {

        return 'completed';
    }

    return 'scheduled';
}

// ==========================================
// MATCH LABEL
// ==========================================

function getMatchLabel(
    fixture
) {

    if (!fixture) {
        return 'Match';
    }

    const matchNumber =
        getNumericMatchId(
            fixture.matchId
        );

    return `Match ${matchNumber}`;
}

// ==========================================
// TEAM MENTION
// ==========================================

function getTeamMention(
    teamString
) {

    const roleMatch =
        String(
            teamString ||
            ''
        ).match(
            /<@&\d+>/
        );

    return roleMatch
        ? roleMatch[0]
        : String(
            teamString ||
            'TBD Team'
        );
}

// ==========================================
// STADIUM DISPLAY
// ==========================================

function getStadiumDisplay(
    fixture
) {

    if (!fixture) {
        return 'TBD Stadium';
    }

    return (
        fixture.stadium ||
        fixture.venue ||
        'TBD Stadium'
    );
}

// ==========================================
// FIXTURE DATE DISPLAY
// ==========================================

function getFixtureDateDisplay(
    fixture
) {

    if (!fixture) {
        return 'TBD';
    }

    return formatDateTime(
        fixture.scheduledAt ||
        fixture.date ||
        fixture.time
    );
}

// ==========================================
// SORT FIXTURES
// ==========================================

function sortFixtures(
    fixtures
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return [];
    }

    return [
        ...fixtures
    ].sort(
        (
            first,
            second
        ) => {

            const firstMatchday =
                safeInteger(
                    first.matchday,
                    0
                );

            const secondMatchday =
                safeInteger(
                    second.matchday,
                    0
                );

            if (
                firstMatchday !==
                secondMatchday
            ) {

                return (
                    firstMatchday -
                    secondMatchday
                );
            }

            return (
                getNumericMatchId(
                    first.matchId
                ) -
                getNumericMatchId(
                    second.matchId
                )
            );
        }
    );
}

// ==========================================
// BUILD FIXTURE TITLE
// ==========================================

function buildFixtureTitle(
    fixture
) {

    if (!fixture) {
        return '⚽ Match';
    }

    const home =
        getTeamDisplayName(
            fixture.homeTeam ||
            fixture.home
        );

    const away =
        getTeamDisplayName(
            fixture.awayTeam ||
            fixture.away
        );

    return `${home} vs ${away}`;
}

// ==========================================
// BUILD FIXTURE DESCRIPTION
// ==========================================

function buildFixtureDescription(
    fixture
) {

    if (!fixture) {
        return 'No fixture information available.';
    }

    const lines =
        [];

    lines.push(
        `📅 **Date:** ${getFixtureDateDisplay(fixture)}`
    );

    lines.push(
        `🏟️ **Stadium:** ${getStadiumDisplay(fixture)}`
    );

    if (
        fixture.group
    ) {

        lines.push(
            `📊 **Group:** ${String(fixture.group).toUpperCase()}`
        );
    }

    if (
        fixture.matchday
    ) {

        lines.push(
            `🗓️ **Matchday:** ${fixture.matchday}`
        );
    }

    lines.push(
        `📌 **Status:** ${capitalize(getFixtureStatus(fixture))}`
    );

    return lines.join(
        '\n'
    );
}

// ==========================================
// BUILD MATCH EMBED
// ==========================================

function buildMatchEmbed(
    fixture
) {

    return new EmbedBuilder()
        .setTitle(
            buildFixtureTitle(
                fixture
            )
        )
        .setDescription(
            buildFixtureDescription(
                fixture
            )
        )
        .setColor(
            '#3498DB'
        );
}

// ==========================================
// BUILD MATCHDAY EMBED
// ==========================================

function buildMatchdayEmbed(
    fixtures,
    matchday
) {

    const sortedFixtures =
        sortFixtures(
            fixtures
        );

    const description =
        sortedFixtures.length > 0
            ? sortedFixtures
                .map(
                    fixture =>
                        `**${getMatchLabel(fixture)}** — ` +
                        `${getTeamDisplayName(fixture.homeTeam || fixture.home)} ` +
                        `vs ` +
                        `${getTeamDisplayName(fixture.awayTeam || fixture.away)}`
                )
                .join(
                    '\n'
                )
            : 'No fixtures found.';

    return new EmbedBuilder()
        .setTitle(
            `📅 Matchday ${matchday}`
        )
        .setDescription(
            description
        )
        .setColor(
            '#2ECC71'
        );
}

// ==========================================
// BUILD GROUP EMBED
// ==========================================

function buildGroupEmbed(
    group,
    teams
) {

    const teamList =
        Array.isArray(
            teams
        ) &&
        teams.length > 0
            ? teams
                .map(
                    (
                        team,
                        index
                    ) =>
                        `${index + 1}. **${getTeamDisplayName(team)}**`
                )
                .join(
                    '\n'
                )
            : 'No teams available.';

    return new EmbedBuilder()
        .setTitle(
            `📊 Group ${String(group).toUpperCase()}`
        )
        .setDescription(
            teamList
        )
        .setColor(
            '#9B59B6'
        );
}

// ==========================================
// BUILD TOURNAMENT EMBED
// ==========================================

function buildTournamentEmbed(
    tournament
) {

    if (!tournament) {
        return null;
    }

    const fields =
        [];

    fields.push({
        name:
            '🏆 Tournament',
        value:
            tournament.name ||
            'Unnamed Tournament',
        inline:
            false
    });

    fields.push({
        name:
            '👥 Teams',
        value:
            String(
                tournament.teamsCount ||
                tournament.teamNames?.length ||
                0
            ),
        inline:
            true
    });

    fields.push({
        name:
            '📊 Groups',
        value:
            String(
                tournament.groupsCount ||
                0
            ),
        inline:
            true
    });

    fields.push({
        name:
            '🎯 Format',
        value:
            tournament.format ||
            'Not set',
        inline:
            true
    });

    fields.push({
        name:
            '🗓️ Matchdays',
        value:
            String(
                tournament.totalMatchdays ||
                0
            ),
        inline:
            true
    });

    fields.push({
        name:
            '📌 Status',
        value:
            tournament.isActive
                ? 'Active'
                : 'Inactive',
        inline:
            true
    });

    return new EmbedBuilder()
        .setTitle(
            `🏆 ${tournament.name || 'Tournament'}`
        )
        .addFields(
            fields
        )
        .setColor(
            '#F1C40F'
        );
}

// ==========================================
// TOURNAMENT SUMMARY
// ==========================================

function buildTournamentSummary(
    tournament
) {

    if (!tournament) {
        return 'No tournament found.';
    }

    return [
        `🏆 **${tournament.name || 'Unnamed Tournament'}**`,
        `👥 Teams: **${tournament.teamsCount || 0}**`,
        `📊 Groups: **${tournament.groupsCount || 0}**`,
        `🎯 Format: **${tournament.format || 'Not set'}**`,
        `🗓️ Matchdays: **${tournament.totalMatchdays || 0}**`,
        `📌 Status: **${tournament.isActive ? 'Active' : 'Inactive'}**`
    ].join(
        '\n'
    );
}

// ==========================================
// CREATE MATCH ROW
// ==========================================

function createMatchRow(
    fixture
) {

    return {
        matchId:
            fixture?.matchId ||
            null,
        matchday:
            fixture?.matchday ||
            null,
        group:
            fixture?.group ||
            null,
        homeTeam:
            fixture?.homeTeam ||
            fixture?.home ||
            null,
        awayTeam:
            fixture?.awayTeam ||
            fixture?.away ||
            null,
        stadium:
            fixture?.stadium ||
            fixture?.venue ||
            null,
        scheduledAt:
            fixture?.scheduledAt ||
            fixture?.date ||
            fixture?.time ||
            null,
        status:
            getFixtureStatus(
                fixture
            )
    };
}

// ==========================================
// NORMALIZE FIXTURE
// ==========================================

function normalizeFixture(
    fixture
) {

    if (!fixture) {
        return null;
    }

    return {
        ...fixture,
        matchId:
            fixture.matchId ||
            fixture.id ||
            null,
        homeTeam:
            fixture.homeTeam ||
            fixture.home ||
            null,
        awayTeam:
            fixture.awayTeam ||
            fixture.away ||
            null,
        stadium:
            fixture.stadium ||
            fixture.venue ||
            null,
        scheduledAt:
            fixture.scheduledAt ||
            fixture.date ||
            fixture.time ||
            null
    };
}

// ==========================================
// NORMALIZE FIXTURES
// ==========================================

function normalizeFixtures(
    fixtures
) {

    if (
        !Array.isArray(
            fixtures
        )
    ) {

        return [];
    }

    return fixtures
        .map(
            normalizeFixture
        )
        .filter(
            Boolean
        );
}

// ==========================================
// MATCHDAY NUMBERS
// ==========================================

function getMatchdayNumbers(
    fixtures
) {

    const numbers =
        new Set();

    normalizeFixtures(
        fixtures
    ).forEach(
        fixture => {

            if (
                fixture.matchday !==
                undefined &&
                fixture.matchday !==
                null
            ) {

                numbers.add(
                    safeInteger(
                        fixture.matchday
                    )
                );
            }
        }
    );

    return [
        ...numbers
    ].sort(
        (
            first,
            second
        ) =>
            first -
            second
    );
}

// ==========================================
// GROUP LETTERS
// ==========================================

function getGroupLetters(
    groups
) {

    if (
        !groups ||
        typeof groups !== 'object'
    ) {

        return [];
    }

    return Object.keys(
        groups
    ).sort();
}

// ==========================================
// GET ALL TEAMS
// ==========================================

function getAllTeams(
    tournament
) {

    if (!tournament) {
        return [];
    }

    if (
        Array.isArray(
            tournament.teamNames
        )
    ) {

        return [
            ...tournament.teamNames
        ];
    }

    const teams =
        [];

    if (
        tournament.drawGroups &&
        typeof tournament.drawGroups ===
            'object'
    ) {

        Object.values(
            tournament.drawGroups
        ).forEach(
            groupTeams => {

                if (
                    Array.isArray(
                        groupTeams
                    )
                ) {

                    teams.push(
                        ...groupTeams
                    );
                }
            }
        );
    }

    return teams;
}

// ==========================================
// TEAM INDEX
// ==========================================

function getTeamIndex(
    tournament,
    teamName
) {

    const teams =
        getAllTeams(
            tournament
        );

    return teams.findIndex(
        team =>
            String(
                team
            ) ===
            String(
                teamName
            )
    );
}

// ==========================================
// GROUP TEAM COUNT
// ==========================================

function getGroupTeamCount(
    tournament,
    group
) {

    if (
        !tournament ||
        !tournament.drawGroups
    ) {

        return 0;
    }

    const teams =
        tournament.drawGroups[
            group
        ];

    return Array.isArray(
        teams
    )
        ? teams.length
        : 0;
}

// ==========================================
// DRAW REVEAL COUNT
// ==========================================

function getDrawRevealCount(
    tournament,
    group
) {

    if (
        !tournament ||
        !tournament.drawRevealState
    ) {

        return 0;
    }

    return safeInteger(
        tournament.drawRevealState[
            group
        ],
        0
    );
}

// ==========================================
// IS DRAW COMPLETE
// ==========================================

function isDrawComplete(
    tournament
) {

    if (
        !tournament ||
        !tournament.drawGroups
    ) {

        return true;
    }

    return Object.keys(
        tournament.drawGroups
    ).every(
        group => {

            const total =
                getGroupTeamCount(
                    tournament,
                    group
                );

            const revealed =
                getDrawRevealCount(
                    tournament,
                    group
                );

            return (
                revealed >=
                total
            );
        }
    );
}

// ==========================================
// GET HIDDEN DRAW DISPLAY
// ==========================================

function getHiddenDrawDisplay(
    tournament,
    group
) {

    const teams =
        tournament?.drawGroups?.[
            group
        ] || [];

    const revealed =
        getDrawRevealCount(
            tournament,
            group
        );

    return teams.map(
        (
            team,
            index
        ) => {

            if (
                index <
                revealed
            ) {

                return `**${index + 1}. ${getTeamDisplayName(team)}**`;
            }

            return `**${index + 1}. 🔒 Hidden**`;
        }
    );
}

// ==========================================
// BUILD DRAW OUTPUT
// ==========================================

function buildDrawOutput(
    tournament
) {

    if (
        !tournament ||
        !tournament.drawGroups
    ) {

        return '❌ No draw information is available.';
    }

    let output =
        '🎲 **Tournament Draw**\n\n';

    Object.keys(
        tournament.drawGroups
    ).forEach(
        group => {

            output +=
                `## Group ${String(group).toUpperCase()}\n`;

            const display =
                getHiddenDrawDisplay(
                    tournament,
                    group
                );

            if (
                display.length ===
                0
            ) {

                output +=
                    'No teams.\n\n';

                return;
            }

            output +=
                display.join(
                    '\n'
                ) +
                '\n\n';
        }
    );

    return output.trim();
}

// ==========================================
// BUILD REVEAL OUTPUT
// ==========================================

function buildRevealOutput(
    tournament,
    group,
    team
) {

    const groupName =
        String(
            group
        ).toUpperCase();

    return [
        `🎲 **Group ${groupName} Draw**`,
        '',
        `🔓 **Revealed:** ${getTeamDisplayName(team)}`,
        '',
        `Use **\`-draw ${groupName}\`** to reveal the next team.`
    ].join(
        '\n'
    );
}

// ==========================================
// VALIDATE GROUP
// ==========================================

function isValidGroup(
    tournament,
    group
) {

    if (
        !tournament ||
        !tournament.drawGroups
    ) {

        return false;
    }

    return Object.prototype.hasOwnProperty.call(
        tournament.drawGroups,
        group
    );
}

// ==========================================
// NEXT TEAM TO REVEAL
// ==========================================

function getNextTeamToReveal(
    tournament,
    group
) {

    if (
        !isValidGroup(
            tournament,
            group
        )
    ) {

        return null;
    }

    const teams =
        tournament.drawGroups[
            group
        ] || [];

    const revealed =
        getDrawRevealCount(
            tournament,
            group
        );

    if (
        revealed >=
        teams.length
    ) {

        return null;
    }

    return teams[
        revealed
    ];
}

// ==========================================
// INCREMENT DRAW REVEAL
// ==========================================

function incrementDrawReveal(
    tournament,
    group
) {

    if (
        !isValidGroup(
            tournament,
            group
        )
    ) {

        return false;
    }

    if (
        !tournament.drawRevealState
    ) {

        tournament.drawRevealState =
            {};
    }

    const current =
        getDrawRevealCount(
            tournament,
            group
        );

    const total =
        getGroupTeamCount(
            tournament,
            group
        );

    if (
        current >=
        total
    ) {

        return false;
    }

    tournament.drawRevealState[
        group
    ] =
        current + 1;

    return true;
}

// ==========================================
// BUILD GROUP TABLE
// ==========================================

function buildGroupTable(
    tournament,
    group
) {

    const teams =
        tournament?.drawGroups?.[
            group
        ] || [];

    if (
        teams.length ===
        0
    ) {

        return 'No teams in this group.';
    }

    const rows =
        teams.map(
            (
                team,
                index
            ) =>
                `${index + 1}. ${getTeamDisplayName(team)}`
        );

    return rows.join(
        '\n'
    );
}

// ==========================================
// BUILD FIXTURE LIST
// ==========================================

function buildFixtureList(
    fixtures
) {

    const normalized =
        normalizeFixtures(
            fixtures
        );

    if (
        normalized.length ===
        0
    ) {

        return 'No fixtures found.';
    }

    return sortFixtures(
        normalized
    )
        .map(
            fixture =>
                `**${getMatchLabel(fixture)}** — ` +
                `${getTeamDisplayName(fixture.homeTeam)} ` +
                `vs ` +
                `${getTeamDisplayName(fixture.awayTeam)}`
        )
        .join(
            '\n'
        );
}

// ==========================================
// BUILD FIXTURE DETAILS
// ==========================================

function buildFixtureDetails(
    fixture
) {

    const normalized =
        normalizeFixture(
            fixture
        );

    if (!normalized) {
        return 'No fixture found.';
    }

    return [
        `🏆 **${getMatchLabel(normalized)}**`,
        `⚔️ **${getTeamDisplayName(normalized.homeTeam)} vs ${getTeamDisplayName(normalized.awayTeam)}**`,
        `📊 Group: **${normalized.group ? String(normalized.group).toUpperCase() : 'N/A'}**`,
        `🗓️ Matchday: **${normalized.matchday ?? 'N/A'}**`,
        `🏟️ Stadium: **${getStadiumDisplay(normalized)}**`,
        `📅 Scheduled: **${getFixtureDateDisplay(normalized)}**`,
        `📌 Status: **${capitalize(getFixtureStatus(normalized))}**`
    ].join(
        '\n'
    );
}

// ==========================================
// TOURNAMENT FIXTURE COUNT
// ==========================================

function getTournamentFixtureCount(
    tournament
) {

    if (!tournament) {
        return 0;
    }

    return Array.isArray(
        tournament.fixtures
    )
        ? tournament.fixtures.length
        : 0;
}

// ==========================================
// TOURNAMENT COMPLETED COUNT
// ==========================================

function getTournamentCompletedCount(
    tournament
) {

    if (!tournament) {
        return 0;
    }

    const fixtures =
        normalizeFixtures(
            tournament.fixtures
        );

    return fixtures.filter(
        fixture =>
            getFixtureStatus(
                fixture
            ) ===
            'completed'
    ).length;
}

// ==========================================
// TOURNAMENT PENDING COUNT
// ==========================================

function getTournamentPendingCount(
    tournament
) {

    return Math.max(
        0,
        getTournamentFixtureCount(
            tournament
        ) -
        getTournamentCompletedCount(
            tournament
        )
    );
}

// ==========================================
// TOURNAMENT PROGRESS
// ==========================================

function getTournamentProgress(
    tournament
) {

    const total =
        getTournamentFixtureCount(
            tournament
        );

    const completed =
        getTournamentCompletedCount(
            tournament
        );

    if (
        total ===
        0
    ) {

        return 0;
    }

    return Math.round(
        (
            completed /
            total
        ) *
        100
    );
}

// ==========================================
// PROGRESS BAR
// ==========================================

function buildProgressBar(
    percentage,
    length = 10
) {

    const safePercentage =
        Math.max(
            0,
            Math.min(
                100,
                safeNumber(
                    percentage,
                    0
                )
            )
        );

    const filled =
        Math.round(
            (
                safePercentage /
                100
            ) *
            length
        );

    const empty =
        Math.max(
            0,
            length -
            filled
        );

    return (
        '█'.repeat(
            filled
        ) +
        '░'.repeat(
            empty
        )
    );
}

// ==========================================
// TOURNAMENT PROGRESS DISPLAY
// ==========================================

function buildTournamentProgress(
    tournament
) {

    const progress =
        getTournamentProgress(
            tournament
        );

    return [
        `📈 **Tournament Progress:** ${progress}%`,
        `\`${buildProgressBar(progress)}\``
    ].join(
        '\n'
    );
}

// ==========================================
// FIXTURE MATCH STATUS DISPLAY
// ==========================================

function buildStatusDisplay(
    fixture
) {

    const status =
        getFixtureStatus(
            fixture
        );

    switch (
        status
    ) {

        case 'completed':
            return '✅ Completed';

        case 'scheduled':
            return '🕒 Scheduled';

        case 'reserved':
            return '📌 Reserved';

        case 'cancelled':
            return '❌ Cancelled';

        default:
            return `📍 ${capitalize(status)}`;
    }
}

// ==========================================
// RESERVATION STATUS
// ==========================================

function isFixtureReserved(
    fixture
) {

    if (!fixture) {
        return false;
    }

    return (
        fixture.reserved ===
        true ||
        fixture.status ===
        'reserved'
    );
}

// ==========================================
// COMPLETION CHECK
// ==========================================

function isFixtureCompleted(
    fixture
) {

    if (!fixture) {
        return false;
    }

    return (
        fixture.completed ===
        true ||
        fixture.status ===
        'completed'
    );
}

// ==========================================
// CANCEL CHECK
// ==========================================

function isFixtureCancelled(
    fixture
) {

    if (!fixture) {
        return false;
    }

    return (
        fixture.cancelled ===
        true ||
        fixture.status ===
        'cancelled'
    );
}

// ==========================================
// AVAILABLE FIXTURE CHECK
// ==========================================

function isFixtureAvailable(
    fixture
) {

    if (!fixture) {
        return false;
    }

    return !(
        isFixtureReserved(
            fixture
        ) ||
        isFixtureCompleted(
            fixture
        ) ||
        isFixtureCancelled(
            fixture
        )
    );
}

// ==========================================
// GET HOME TEAM
// ==========================================

function getHomeTeam(
    fixture
) {

    return (
        fixture?.homeTeam ||
        fixture?.home ||
        'TBD Team'
    );
}

// ==========================================
// GET AWAY TEAM
// ==========================================

function getAwayTeam(
    fixture
) {

    return (
        fixture?.awayTeam ||
        fixture?.away ||
        'TBD Team'
    );
}

// ==========================================
// GET MATCH STADIUM
// ==========================================

function getMatchStadium(
    fixture
) {

    return (
        fixture?.stadium ||
        fixture?.venue ||
        'TBD Stadium'
    );
}

// ==========================================
// GET MATCH GROUP
// ==========================================

function getMatchGroup(
    fixture
) {

    return (
        fixture?.group ||
        null
    );
}

// ==========================================
// GET MATCHDAY
// ==========================================

function getMatchday(
    fixture
) {

    return safeInteger(
        fixture?.matchday,
        0
    );
}

// ==========================================
// GET SCHEDULED DATE
// ==========================================

function getScheduledDate(
    fixture
) {

    return (
        fixture?.scheduledAt ||
        fixture?.date ||
        fixture?.time ||
        null
    );
}

// ==========================================
// FIXTURE SEARCH
// ==========================================

function searchFixtures(
    fixtures,
    searchTerm
) {

    const normalizedTerm =
        String(
            searchTerm ||
            ''
        )
            .trim()
            .toLowerCase();

    if (
        !normalizedTerm
    ) {

        return [];
    }

    return normalizeFixtures(
        fixtures
    ).filter(
        fixture => {

            const searchable =
                [
                    fixture.matchId,
                    fixture.homeTeam,
                    fixture.awayTeam,
                    fixture.group,
                    fixture.stadium,
                    fixture.status
                ]
                    .map(
                        value =>
                            String(
                                value ||
                                ''
                            ).toLowerCase()
                    )
                    .join(
                        ' '
                    );

            return searchable.includes(
                normalizedTerm
            );
        }
    );
}

// ==========================================
// UNIQUE VALUES
// ==========================================

function uniqueValues(
    values
) {

    return [
        ...new Set(
            values
        )
    ];
}

// ==========================================
// TEAM NAMES FROM FIXTURES
// ==========================================

function getFixtureTeams(
    fixtures
) {

    const teams =
        [];

    normalizeFixtures(
        fixtures
    ).forEach(
        fixture => {

            if (
                fixture.homeTeam
            ) {

                teams.push(
                    fixture.homeTeam
                );
            }

            if (
                fixture.awayTeam
            ) {

                teams.push(
                    fixture.awayTeam
                );
            }
        }
    );

    return uniqueValues(
        teams
    );
}

// ==========================================
// GROUPS FROM FIXTURES
// ==========================================

function getFixtureGroups(
    fixtures
) {

    const groups =
        [];

    normalizeFixtures(
        fixtures
    ).forEach(
        fixture => {

            if (
                fixture.group
            ) {

                groups.push(
                    fixture.group
                );
            }
        }
    );

    return uniqueValues(
        groups
    );
}

// ==========================================
// STADIUMS FROM FIXTURES
// ==========================================

function getFixtureStadiums(
    fixtures
) {

    const stadiums =
        [];

    normalizeFixtures(
        fixtures
    ).forEach(
        fixture => {

            if (
                fixture.stadium
            ) {

                stadiums.push(
                    fixture.stadium
                );
            }
        }
    );

    return uniqueValues(
        stadiums
    );
}

// ==========================================
// MATCHDAY SUMMARY
// ==========================================

function buildMatchdaySummary(
    fixtures,
    matchday
) {

    const matchdayFixtures =
        getMatchdayFixtures(
            fixtures,
            matchday
        );

    const total =
        matchdayFixtures.length;

    const completed =
        matchdayFixtures.filter(
            isFixtureCompleted
        ).length;

    const pending =
        total -
        completed;

    return [
        `🗓️ **Matchday ${matchday} Summary**`,
        `⚽ Total Matches: **${total}**`,
        `✅ Completed: **${completed}**`,
        `🕒 Pending: **${pending}**`
    ].join(
        '\n'
    );
}

// ==========================================
// GROUP SUMMARY
// ==========================================

function buildGroupSummary(
    tournament,
    group
) {

    const teams =
        tournament?.drawGroups?.[
            group
        ] || [];

    const fixtures =
        getGroupFixtures(
            tournament?.fixtures,
            group
        );

    const completed =
        fixtures.filter(
            isFixtureCompleted
        ).length;

    return [
        `📊 **Group ${String(group).toUpperCase()} Summary**`,
        `👥 Teams: **${teams.length}**`,
        `⚽ Fixtures: **${fixtures.length}**`,
        `✅ Completed: **${completed}**`,
        `🕒 Pending: **${fixtures.length - completed}**`
    ].join(
        '\n'
    );
}

// ==========================================
// TEAM SUMMARY
// ==========================================

function buildTeamSummary(
    tournament,
    team
) {

    const fixtures =
        getTeamFixtures(
            tournament?.fixtures,
            team
        );

    const completed =
        fixtures.filter(
            isFixtureCompleted
        ).length;

    return [
        `👕 **${getTeamDisplayName(team)}**`,
        `⚽ Matches: **${fixtures.length}**`,
        `✅ Completed: **${completed}**`,
        `🕒 Pending: **${fixtures.length - completed}**`
    ].join(
        '\n'
    );
}

// ==========================================
// TOURNAMENT ACTIVE CHECK
// ==========================================

function isTournamentActive(
    tournament
) {

    return Boolean(
        tournament &&
        tournament.isActive ===
            true
    );
}

// ==========================================
// TOURNAMENT COMPLETE CHECK
// ==========================================

function isTournamentComplete(
    tournament
) {

    if (!tournament) {
        return false;
    }

    return (
        tournament.status ===
            'complete' ||
        (
            getTournamentFixtureCount(
                tournament
            ) > 0 &&
            getTournamentPendingCount(
                tournament
            ) === 0
        )
    );
}

// ==========================================
// TOURNAMENT FORMAT DISPLAY
// ==========================================

function getFormatDisplay(
    format
) {

    switch (
        String(
            format ||
            ''
        ).toLowerCase()
    ) {

        case 'ucl':
            return '🏆 UCL';

        case 'round_robin':
            return '🔄 Round Robin';

        default:
            return capitalize(
                String(
                    format ||
                    'Unknown'
                )
            );
    }
}

// ==========================================
// TOURNAMENT STATUS DISPLAY
// ==========================================

function getTournamentStatusDisplay(
    tournament
) {

    if (!tournament) {
        return '❌ Not Found';
    }

    if (
        isTournamentComplete(
            tournament
        )
    ) {

        return '🏁 Complete';
    }

    if (
        isTournamentActive(
            tournament
        )
    ) {

        return '🟢 Active';
    }

    return '⚪ Inactive';
}

// ==========================================
// BUILD TOURNAMENT DETAILS
// ==========================================

function buildTournamentDetails(
    tournament
) {

    if (!tournament) {
        return '❌ Tournament not found.';
    }

    return [
        `🏆 **${tournament.name || 'Unnamed Tournament'}**`,
        `👥 Teams: **${tournament.teamsCount || 0}**`,
        `📊 Groups: **${tournament.groupsCount || 0}**`,
        `🎯 Format: **${getFormatDisplay(tournament.format)}**`,
        `🗓️ Matchdays: **${tournament.totalMatchdays || 0}**`,
        `⚽ Fixtures: **${getTournamentFixtureCount(tournament)}**`,
        `📈 Progress: **${getTournamentProgress(tournament)}%**`,
        `📌 Status: **${getTournamentStatusDisplay(tournament)}**`
    ].join(
        '\n'
    );
}
            10
        );

    return isNaN(number)
        ? 0
        : number;
}

// ==========================================
// DISPLAY MATCH ID
// ==========================================

function getDisplayIdFromMatchId(
    matchId,
    tournament
) {

    const registryMatch =
        tournament.matchRegistry.get(
            matchId
        );

    if (
        registryMatch &&
        registryMatch.displayId
    ) {

        return registryMatch.displayId;
    }

    return getNumericMatchId(
        matchId
    );
}

// ==========================================
// UNIFIED FIXED MATCHDAY DEADLINE
// ==========================================

function getMatchdayDeadlineTimestamp(
    matchdayNumber,
    tournament
) {

    const anchorDate =
        tournament.startDate ||
        tournament.createdAt ||
        new Date();

    const firstDayDeadlineDays =
        Math.max(
            1,
            tournament.firstDayDeadlineDays ??
            1
        );

    const istDateString =
        anchorDate.toLocaleDateString(
            'en-CA',
            {
                timeZone:
                    'Asia/Kolkata'
            }
        );

    const [
        year,
        month,
        day
    ] =
        istDateString
            .split('-')
            .map(Number);

    const targetDate =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );

    const totalDaysOffset =
        (
            firstDayDeadlineDays -
            1
        ) +
        (
            matchdayNumber -
            1
        );

    targetDate.setUTCDate(
        targetDate.getUTCDate() +
        totalDaysOffset
    );

    // 23:59 IST = 18:29 UTC

    const deadlineUTC =
        Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            18,
            29,
            0
        );

    return Math.floor(
        deadlineUTC /
        1000
    );
}

// ==========================================
// RESERVE DEADLINE
// ==========================================

function getReserveDeadlineTimestamp(
    tournament
) {

    const finalMatchday =
        tournament.totalMatchdays ||
        1;

    const reserveDays =
        tournament.reserveDeadlineDays ??
        2;

    const anchorDate =
        tournament.startDate ||
        tournament.createdAt ||
        new Date();

    const firstDayDeadlineDays =
        Math.max(
            1,
            tournament.firstDayDeadlineDays ??
            1
        );

    const istDateString =
        anchorDate.toLocaleDateString(
            'en-CA',
            {
                timeZone:
                    'Asia/Kolkata'
            }
        );

    const [
        year,
        month,
        day
    ] =
        istDateString
            .split('-')
            .map(Number);

    const targetDate =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );

    const totalDaysOffset =
        (
            firstDayDeadlineDays -
            1
        ) +
        (
            finalMatchday -
            1
        ) +
        reserveDays;

    targetDate.setUTCDate(
        targetDate.getUTCDate() +
        totalDaysOffset
    );

    // 23:59 IST

    const deadlineUTC =
        Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            18,
            29,
            0
        );

    return Math.floor(
        deadlineUTC /
        1000
    );
}

// ==========================================
// ROUND ROBIN FIXTURE GENERATOR
// ==========================================

function generateRoundRobinFixtures(
    teamNames,
    groupsCount,
    roundsCount,
    guildId
) {

    const alphabet =
        'abcdefghijklmnopqrstuvwxyz'
            .split('');

    const fullTeamPool =
        [...teamNames];

    const groups =
        {};

    for (
        let i = 0;
        i < groupsCount;
        i++
    ) {

        groups[
            alphabet[i]
        ] = [];
    }

    fullTeamPool.forEach(
        (
            teamName,
            index
        ) => {

            groups[
                alphabet[
                    index %
                    groupsCount
                ]
            ].push(
                teamName
            );
        }
    );

    const masterSchedules =
        {};

    const registry =
        {};

    let displayMatchCounter =
        1;

    let maxGroupSize =
        0;

    Object.keys(
        groups
    ).forEach(
        g => {

            if (
                groups[g].length >
                maxGroupSize
            ) {

                maxGroupSize =
                    groups[g].length;
            }
        }
    );

    if (
        maxGroupSize % 2 !==
        0
    ) {

        maxGroupSize++;
    }

    const matchdaysPerRound =
        maxGroupSize -
        1;

    const finalTotalDays =
        matchdaysPerRound *
        roundsCount;

    for (
        let d = 1;
        d <= finalTotalDays;
        d++
    ) {

        masterSchedules[
            `day_${d}`
        ] = {};

        Object.keys(
            groups
        ).forEach(
            g => {

                masterSchedules[
                    `day_${d}`
                ][g] = [];
            }
        );
    }

    Object.keys(
        groups
    ).forEach(
        gName => {

            const pool =
                [
                    ...groups[gName]
                ];

            if (
                pool.length % 2 !==
                0
            ) {

                pool.push(
                    'BYE'
                );
            }

            const n =
                pool.length;

            const uniqueDays =
                n - 1;

            let absoluteDay =
                1;

            for (
                let r = 0;
                r < roundsCount;
                r++
            ) {

                const rotationPool =
                    [...pool];

                for (
                    let round = 0;
                    round < uniqueDays;
                    round++
                ) {

                    const dayKey =
                        `day_${absoluteDay}`;

                    for (
                        let i = 0;
                        i < n / 2;
                        i++
                    ) {

                        const home =
                            rotationPool[i];

                        const away =
                            rotationPool[
                                n - 1 - i
                            ];

                        if (
                            home.includes(
                                'BYE'
                            ) ||
                            away.includes(
                                'BYE'
                            )
                        ) {

                            continue;
                        }

                        const globalMatchKey =
                            `${guildId}_${displayMatchCounter}`;

                        const matchObj = {

                            id:
                                globalMatchKey,

                            displayId:
                                displayMatchCounter,

                            home:
                                r % 2 === 0
                                    ? home
                                    : away,

                            away:
                                r % 2 === 0
                                    ? away
                                    : home
                        };

                        masterSchedules[
                            dayKey
                        ][gName].push(
                            matchObj
                        );

                        registry[
                            globalMatchKey
                        ] = {

                            displayId:
                                displayMatchCounter,

                            day:
                                absoluteDay,

                            group:
                                gName,

                            home:
                                matchObj.home,

                            away:
                                matchObj.away
                        };

                        displayMatchCounter++;
                    }

                    rotationPool.splice(
                        1,
                        0,
                        rotationPool.pop()
                    );

                    absoluteDay++;
                }
            }
        }
    );

    return {

        fixtures:
            masterSchedules,

        matchRegistry:
            registry
    };
}

// ==========================================
// UCL FIXTURE GENERATOR
// ==========================================

function generateUCLFixtures(
    teamNames,
    groupsCount,
    totalMatchdays,
    guildId
) {

    const alphabet =
        'abcdefghijklmnopqrstuvwxyz'
            .split('');

    const fullTeamPool =
        [...teamNames];

    const groups =
        {};

    for (
        let i = 0;
        i < groupsCount;
        i++
    ) {

        groups[
            alphabet[i]
        ] = [];
    }

    fullTeamPool.forEach(
        (
            teamName,
            index
        ) => {

            groups[
                alphabet[
                    index %
                    groupsCount
                ]
            ].push(
                teamName
            );
        }
    );

    const masterSchedules =
        {};

    const registry =
        {};

    let displayMatchCounter =
        1;

    const groupRoundPools =
        {};

    Object.keys(
        groups
    ).forEach(
        gName => {

            const pool =
                [
                    ...groups[gName]
                ];

            if (
                pool.length % 2 !==
                0
            ) {

                pool.push(
                    'BYE'
                );
            }

            const n =
                pool.length;

            const uniqueDays =
                n - 1;

            groupRoundPools[
                gName
            ] = [];

            const rotationPool =
                [...pool];

            for (
                let round = 0;
                round < uniqueDays;
                round++
            ) {

                const roundMatches =
                    [];

                for (
                    let i = 0;
                    i < n / 2;
                    i++
                ) {

                    roundMatches.push({

                        home:
                            rotationPool[i],

                        away:
                            rotationPool[
                                n - 1 - i
                            ]
                    });
                }

                groupRoundPools[
                    gName
                ].push(
                    roundMatches
                );

                rotationPool.splice(
                    1,
                    0,
                    rotationPool.pop()
                );
            }
        }
    );

    for (
        let day = 1;
        day <= totalMatchdays;
        day++
    ) {

        const dayKey =
            `day_${day}`;

        masterSchedules[
            dayKey
        ] = {};

        Object.keys(
            groups
        ).forEach(
            gName => {

                masterSchedules[
                    dayKey
                ][gName] = [];

                const uniqueDaysCount =
                    groupRoundPools[
                        gName
                    ].length;

                const poolIndex =
                    (
                        day - 1
                    ) %
                    uniqueDaysCount;

                const targetFixtures =
                    groupRoundPools[
                        gName
                    ][poolIndex];

                const invert =
                    Math.floor(
                        (
                            day - 1
                        ) /
                        uniqueDaysCount
                    ) %
                    2 ===
                    1;

                targetFixtures.forEach(
                    match => {

                        if (
                            match.home.includes(
                                'BYE'
                            ) ||
                            match.away.includes(
                                'BYE'
                            )
                        ) {

                            return;
                        }

                        const globalMatchKey =
                            `${guildId}_${displayMatchCounter}`;

                        const matchObj = {

                            id:
                                globalMatchKey,

                            displayId:
                                displayMatchCounter,

                            home:
                                invert
                                    ? match.away
                                    : match.home,

                            away:
                                invert
                                    ? match.home
                                    : match.away
                        };

                        masterSchedules[
                            dayKey
                        ][gName].push(
                            matchObj
                        );

                        registry[
                            globalMatchKey
                        ] = {

                            displayId:
                                displayMatchCounter,

                            day:
                                day,

                            group:
                                gName,

                            home:
                                matchObj.home,

                            away:
                                matchObj.away
                        };

                        displayMatchCounter++;
                    }
                );
            }
        );
    }

    return {

        fixtures:
            masterSchedules,

        matchRegistry:
            registry
    };
}
// ==========================================
// BACKGROUND AUTOMATED UNLOCK WORKER
// Runs every 30 seconds to process match starts
// ==========================================
setInterval(async () => {
    try {
        const now = new Date();
        
        // Find tournaments that contain active scheduled matches waiting to unlock
        const activeTournaments = await Tournament.find({
            status: 'complete',
            isActive: true,
            "scheduledMatches.unlockAt": { $lte: now },
            "scheduledMatches.triggered": false
        });

        for (const tourney of activeTournaments) {
            let updatedList = [...(tourney.scheduledMatches || [])];
            let modified = false;

            for (const sched of updatedList) {
                if (!sched.triggered && new Date(sched.unlockAt) <= now) {
                    sched.triggered = true;
                    modified = true;

                    const channel = await client.channels.fetch(sched.channelId).catch(() => null);
                    if (channel && channel.isTextBased()) {
                        // UNLOCK THE CHANNEL: Allow server members (@everyone) to type messages again
                        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
                            SendMessages: true
                        }).catch(err => console.error(`Failed to unlock channel ${channel.id}:`, err));

                        // SEND LAUNCH ANNOUNCEMENT MESSAGE
                        await channel.send(
                            `🔔 **Match Time!**\n` +
                            `${sched.homeRole} vs ${sched.awayRole}`
                        ).catch(err => console.error(err));
                    }
                }
            }

            if (modified) {
                tourney.scheduledMatches = updatedList;
                // Mark sub-properties modified for Mixed Schema validation saving
                tourney.markModified('scheduledMatches');
                await tourney.save();
            }
        }
    } catch (error) {
        console.error('Error in automated background unlock execution routine:', error);
    }
}, 30000); // Evaluates every 30 seconds
// ==========================================
// LOGIN
// ==========================================

client.login(
    process.env.DISCORD_TOKEN
);
