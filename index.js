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
        // Get global bot access levels
        const botAccess = await getBotAccess(message.author.id);

        // Look up the active completed tournament to check for server-specific staff roles
        const activeTournamentInstance = await Tournament.findOne({
            guildId: message.guildId,
            isActive: true,
            status: 'complete'
        });

        const hasStaffRole = activeTournamentInstance && 
                             activeTournamentInstance.staffRoleId && 
                             message.member?.roles.cache.has(activeTournamentInstance.staffRoleId);

        // If the user has no global bot access
        if (!botAccess) {
            // They can ONLY proceed if they have the staff role AND are trying to run the -annc command
            if (hasStaffRole && message.content.startsWith(`${PREFIX}annc`)) {
                // Allowed to bypass for announcements
            } else {
                return;
            }
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

                                        // ==========================================
                    // -admin list
                    // ==========================================
                    if (action === 'list') {
                        const admins = await BotAccess.find({ type: 'admin' });

                        const adminList = admins.length > 0
                            ? admins.map((admin, index) => `${index + 1}. <@${admin.userId}>`).join('\n')
                            : '📭 *No Bot Admins currently assigned.*';

                        const listEmbed = new EmbedBuilder()
                            .setTitle('🛡️ Bot Administration List')
                            .setColor('#3498DB')
                            .addFields({ name: '👥 Bot Admins', value: adminList })
                            .setTimestamp();

                        return message.reply({ embeds: [listEmbed] });
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
        .setDescription('Bot Prefix `-` (For Bot Moderators and Admins Only)')
        .setColor('#3498DB')
        .addFields(
            { 
                name: '🏟️ Tournament Maker (`-tourney`)', 
                value: '• `-tourney make <name>` — Make a tournament \n• `-tourney open <name>` — Load a specific exisiting tournament.\n• `-tourney all` — View every tournament exisiting tournament.\n• `-tourney cancel` — Abort a ongoing tournamnt wizard.\n• `-tourney reset` — Reset all the existing tournaments.' 
            },
            { 
                name: '📅 Tournament Matchday (`-md`)', 
                value: '• `-md <number>` — Check a certain matchday fixtures (e.g., `-md 1`).' 
            },
            { 
                name: '📌 Tournament Fixtures (`-fixture`) [🔴Warning! A Dangerous Command that pings teams] ', 
                value: '• `-fixture <number>` —  a well-designed fixture message for any matchday fixtures \n• `-fixture reserve` — Output structural calendars for items sitting on standby flags.' 
            },
            { 
                name: '⏱️ Reserved Tournament Matches (`-reserve`)', 
                value: '• `-reserve` — View all Reserved Matches.\n• `-reserve <match_num>` — Reserve a match.' 
            },
            { 
                name: '⚙️ Fixture Settings (`-panel`)', 
                value: '• `-panel` — Useful Settings For `-fixture` (Overs, Deadlines, Player Reps settings).\n• `-panel overs <number>` — Total Overs (default 20).\n• `-panel reps <allowed/not allowed>` — Reps allowed or not(default Allowed).\n• `-panel fd <days>` — Extend the first day fixture deadline (default 1).\n• `-panel rd <days>` — extend the reserved days deadline(default 2).' 
            },
            { 
                name: '🔑 Bot Access (`-admin` / `-mod`)', 
                value: '• `-admin <@user/ID>` — Appoint a Bot Administrator(Bot Owner Only).\n• `-admin list` / `-admin remove <@user>` — Remove a Bot Administrator(Bot Owner Only).\n• `-mod <@user/ID>` — Appoint a Bot Moderator(Bot Owner/Bot Admins Only).\n• `-mod list` / `-mod remove <@user>` — Review and manage server moderator positions(Bot Owner/Admins Only).' 
            }
        )
        .setFooter({ text: '📌Note Only Bot Moderators can use the commands written above and Bot Admins can appoint Moderators.' })
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

                               // ==========================================
                    // -mod list
                    // ==========================================
                    if (action === 'list') {
                        const mods = await BotAccess.find({ type: 'mod' });

                        const modList = mods.length > 0
                            ? mods.map((mod, index) => `${index + 1}. <@${mod.userId}>`).join('\n')
                            : '📭 *No Bot Mods currently assigned.*';

                        const listEmbed = new EmbedBuilder()
                            .setTitle('⚔️ Bot Moderator List')
                            .setColor('#E67E22')
                            .addFields({ name: '👥 Bot Moderators', value: modList })
                            .setTimestamp();

                        return message.reply({ embeds: [listEmbed] });
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
                        });

                    if (!tournament) {

                        return message.reply(
                            '❌ No active completed tournament workspace found.'
                        );
                    }

                    // ==========================================
                    // -fixture reserve
                    // ==========================================

                    if (
                        fixtureType ===
                        'reserve'
                    ) {

                        const reservedMatches =
                            tournament.reservedMatches ||
                            new Map();

                        const reservedList =
                            [];

                        for (
                            const [
                                matchId,
                                isReserved
                            ]
                            of reservedMatches.entries()
                        ) {

                            if (
                                !isReserved
                            ) {
                                continue;
                            }

                            const registryMatch =
                                tournament.matchRegistry.get(
                                    matchId
                                );

                            if (!registryMatch) {
                                continue;
                            }

                            reservedList.push({
                                matchId,
                                ...registryMatch
                            });
                        }

                        if (
                            reservedList.length ===
                            0
                        ) {

                            return message.reply(
                                '❌ There are currently no reserved matches.'
                            );
                        }

                        reservedList.sort(
                            (
                                a,
                                b
                            ) => {

                                if (
                                    a.day !==
                                    b.day
                                ) {

                                    return (
                                        a.day -
                                        b.day
                                    );
                                }

                                return (
                                    getNumericMatchId(
                                        a.matchId
                                    ) -
                                    getNumericMatchId(
                                        b.matchId
                                    )
                                );
                            }
                        );

                        let output =
                            `# Schedule for Reserved Matches\n\n` +
                            `## ${tournament.name}\n\n`;

                        let currentGroup =
                            null;

                        reservedList.forEach(
                            match => {

                                const groupName =
                                    match.group.toUpperCase();

                                if (
                                    currentGroup !==
                                    groupName
                                ) {

                                    currentGroup =
                                        groupName;

                                    output +=
                                        `## Group ${groupName}\n`;
                                }

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

                                output +=
                                    `### Match ${getDisplayIdFromMatchId(match.matchId, tournament)}\n` +
                                    `- ${homeRole} vs ${awayRole} in ${assignedStadium}\n`;
                            }
                        );

                        const reserveDeadline =
                            getReserveDeadlineTimestamp(
                                tournament
                            );

                        output +=
                            `\n- Complete matches by: **<t:${reserveDeadline}:F>**\n` +
                            `- Team Captains may decide on a **mutual time**..\n` +
                            `- Must do \`.tm\`, \`.ctn\` & \`.o ${tournament.overs ?? 20}\` before starting the match.\n` +
                            `- Matches must be **completed** in the given deadline.\n` +
                            `- **Reps ${tournament.reps ?? 'allowed'}**\n\n` +
                            `### GOOD LUCK`;

                        return message.reply(
                            output
                        );
                    }

                    // ==========================================
                    // NORMAL FIXTURE
                    // ==========================================

                    const targetDayNum =
                        parseInt(
                            args[0],
                            10
                        );

                    if (!targetDayNum) {

                        return message.reply(
                            '❌ Please specify a valid matchday number.\n' +
                            'Examples:\n' +
                            '`-fixture 1`\n' +
                            '`-fixture reserve`'
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
                            '❌ Error fetching matchday fixtures.'
                        );
                    }

                    const deadline =
                        getMatchdayDeadlineTimestamp(
                            targetDayNum,
                            tournament
                        );

                    const totalOvers =
                        tournament.overs ??
                        20;

                    const repsSetting =
                        tournament.reps ??
                        'allowed';

                    let output =
                        `# Schedule for Matchday ${targetDayNum}\n\n` +
                        `## ${tournament.name}\n\n`;

                    Object.keys(
                        matchdayData
                    ).forEach(
                        groupName => {

                            const matches =
                                matchdayData[
                                    groupName
                                ];

                            if (
                                !matches ||
                                matches.length ===
                                0
                            ) {
                                return;
                            }

                            output +=
                                `## Group ${groupName.toUpperCase()}\n`;

                            matches.forEach(
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

                                    output +=
                                        `### Match ${match.displayId}\n` +
                                        `- ${homeRole} vs ${awayRole} in ${assignedStadium}\n`;
                                }
                            );
                        }
                    );

                    output +=
                        `\n- Complete matches by: **<t:${deadline}:F>**\n` +
                        `- Team Captains may decide on a **mutual time**..\n` +
                        `- Must do \`.tm\`, \`.ctn\` & \`.o ${totalOvers}\` before starting the match.\n` +
                        `- Matches must be **completed** in the given deadline.\n` +
                        `- **Reps ${repsSetting}**\n\n` +
                        `### GOOD LUCK`;

                    return message.reply(
                        output
                    );
                }

                // ==========================================
                // 3. RESERVE COMMAND
                // ==========================================

                if (
                    baseCommand === 'reserve'
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

                    const reservedMatches =
                        tournament.reservedMatches ||
                        new Map();

                    // ==========================================
                    // -reserve
                    // ==========================================

                    if (
                        args.length ===
                        0
                    ) {

                        const reservedList =
                            [];

                        for (
                            const [
                                matchId,
                                isReserved
                            ]
                            of reservedMatches.entries()
                        ) {

                            if (
                                !isReserved
                            ) {
                                continue;
                            }

                            const registryMatch =
                                tournament.matchRegistry.get(
                                    matchId
                                );

                            if (!registryMatch) {
                                continue;
                            }

                            reservedList.push({
                                matchId,
                                ...registryMatch
                            });
                        }

                        if (
                            reservedList.length ===
                            0
                        ) {

                            return message.reply(
                                '📭 **No reserved matches currently.**'
                            );
                        }

                        reservedList.sort(
                            (
                                a,
                                b
                            ) => {

                                if (
                                    a.day !==
                                    b.day
                                ) {

                                    return (
                                        a.day -
                                        b.day
                                    );
                                }

                                return (
                                    getNumericMatchId(
                                        a.matchId
                                    ) -
                                    getNumericMatchId(
                                        b.matchId
                                    )
                                );
                            }
                        );

                        const reserveEmbed =
                            new EmbedBuilder()
                                .setTitle(
                                    `📋 Reserved Matches — ${tournament.name}`
                                )
                                .setColor(
                                    '#F1C40F'
                                )
                                .setTimestamp();

                        const grouped =
                            {};

                        reservedList.forEach(
                            match => {

                                const group =
                                    match.group.toUpperCase();

                                if (
                                    !grouped[group]
                                ) {

                                    grouped[group] =
                                        [];
                                }

                                const homeRole =
                                    extractRole(
                                        match.home
                                    );

                                const awayRole =
                                    extractRole(
                                        match.away
                                    );

                                grouped[group].push(
                                    `**Match ${getDisplayIdFromMatchId(match.matchId, tournament)}** — ${homeRole} vs ${awayRole} *(MD ${match.day})*`
                                );
                            }
                        );

                        Object.keys(
                            grouped
                        ).forEach(
                            group => {

                                reserveEmbed.addFields({
                                    name:
                                        `Group ${group}`,

                                    value:
                                        grouped[group].join(
                                            '\n'
                                        )
                                });
                            }
                        );

                        reserveEmbed.setFooter({
                            text:
                                `Reserve deadline: ${tournament.reserveDeadlineDays ?? 2} day(s) after final matchday`
                        });

                        return message.reply({
                            embeds: [
                                reserveEmbed
                            ]
                        });
                    }

                    // ==========================================
                    // RESERVE SPECIFIC MATCH
                    // ==========================================

                    const requestedMatchNumber =
                        parseInt(
                            args[0],
                            10
                        );

                    if (
                        isNaN(
                            requestedMatchNumber
                        ) ||
                        requestedMatchNumber < 1
                    ) {

                        return message.reply(
                            '❌ Please provide a valid match number.\nExample: `-reserve 15`'
                        );
                    }

                    let foundMatch =
                        null;

                    let foundMatchId =
                        null;

                    for (
                        const [
                            matchId,
                            registryMatch
                        ]
                        of tournament.matchRegistry.entries()
                    ) {

                        const displayId =
                            getDisplayIdFromMatchId(
                                matchId,
                                tournament
                            );

                        if (
                            displayId ===
                            requestedMatchNumber
                        ) {

                            foundMatch =
                                registryMatch;

                            foundMatchId =
                                matchId;

                            break;
                        }
                    }

                    if (!foundMatch) {

                        return message.reply(
                            `❌ Match **${requestedMatchNumber}** could not be found.`
                        );
                    }

                    const existingReservation =
                        reservedMatches.get(
                            foundMatchId
                        );

                    if (
                        existingReservation ===
                        true
                    ) {

                        return message.reply(
                            `⚠️ Match **${requestedMatchNumber}** is already reserved.`
                        );
                    }

                    if (
                        !tournament.reservedMatches
                    ) {

                        tournament.reservedMatches =
                            new Map();
                    }

                    tournament.reservedMatches.set(
                        foundMatchId,
                        true
                    );

                    if (
                        !tournament.reservations
                    ) {

                        tournament.reservations =
                            new Map();
                    }

                    tournament.reservations.set(
                        foundMatchId,
                        true
                    );

                    await tournament.save();

                    const homeRole =
                        extractRole(
                            foundMatch.home
                        );

                    const awayRole =
                        extractRole(
                            foundMatch.away
                        );

                    const reserveEmbed =
                        new EmbedBuilder()
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
                                // ==========================================
                // -annc <MATCHDAY> <TIME> COMMAND
                // Example: -annc 3 7:30PM
                // ==========================================
                if (baseCommand === 'annc') {
                    // Extract the matchday number from the first argument
                    const targetMDInput = args[0];
                    // Extract the rest of the arguments as the time string
                    const timeInput = args.slice(1).join(' ').trim();

                    const targetMatchdayNum = parseInt(targetMDInput, 10);

                    if (isNaN(targetMatchdayNum) || !timeInput) {
                        return message.reply('❌ **Usage Error:** Provide a target matchday number and launch time.\nExample: `-annc 3 7:30PM`');
                    }

                    // Look up active tournament mapping configuration
                    const tournament = await Tournament.findOne({
                        guildId: message.guildId,
                        isActive: true,
                        status: 'complete'
                    });

                    if (!tournament) {
                        return message.reply('❌ No active completed tournament workspace currently found in this server.');
                    }

                    // SEARCH FOR A MATCH ASSIGNED TO THIS SPECIFIC STADIUM CHANNEL AND MATCHDAY
                    let activeMatch = null;
                    let activeMatchId = null;

                    for (const [matchId, registryMatch] of tournament.matchRegistry.entries()) {
                        const homeChan = extractChannel(registryMatch.home);
                        const awayChan = extractChannel(registryMatch.away);
                        
                        // FIX: Verify BOTH the channel ID and that it belongs to the specified matchday
                        if (
                            (homeChan === `<#${message.channelId}>` || awayChan === `<#${message.channelId}>`) && 
                            registryMatch.day === targetMatchdayNum
                        ) {
                            activeMatch = registryMatch;
                            activeMatchId = matchId;
                            break;
                        }
                    }

                    if (!activeMatch) {
                        return message.reply(`❌ **Error:** No match registry data found for this stadium channel on **Matchday ${targetMatchdayNum}**.`);
                    }

                    // PARSE TIME STRING (Assumes India Standard Time context per deadline parameters)
                    const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)\$/i;
                    const matchTimeParts = timeInput.match(timeRegex);

                    if (!matchTimeParts) {
                        return message.reply('❌ **Invalid Time Format!** Use `HH:MM AM/PM` configuration layout.\nExample: `-annc 3 7:30PM`');
                    }

                    let hours = parseInt(matchTimeParts[1], 10);
                    const minutes = parseInt(matchTimeParts[2], 10);
                    const ampm = matchTimeParts[3].toUpperCase();

                    if (ampm === 'PM' && hours < 12) hours += 12;
                    if (ampm === 'AM' && hours === 12) hours = 0;

                    // Form target processing timestamp date bound inside local server frame
                    const now = new Date();

                    const istParts = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).formatToParts(now);

                    const year = Number(istParts.find(p => p.type === 'year').value);
                    const month = Number(istParts.find(p => p.type === 'month').value);
                    const day = Number(istParts.find(p => p.type === 'day').value);

                    const targetUnlockDate = new Date(
                        Date.UTC(year, month - 1, day, hours, minutes, 0) - (5.5 * 60 * 60 * 1000)
                    );

                    // If user provides a time that has already passed today, assume they mean tomorrow
                    if (targetUnlockDate <= now) {
                        targetUnlockDate.setDate(targetUnlockDate.getDate() + 1);
                    }

                    const targetTimestamp = Math.floor(targetUnlockDate.getTime() / 1000);

                    // LOCK CHANNEL PERMISSIONS IMMEDIATELY: Stop players from typing until kick-off
                    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                        SendMessages: false
                    }).catch(err => {
                        console.error(err);
                        return message.reply('❌ Failed to lock this channel. Ensure the bot has **Manage Channels** or **Manage Roles** permissions.');
                    });

                    // SAVE THE ACTION LOG TO THE DATABASE ARRAY
                    if (!tournament.scheduledMatches) tournament.scheduledMatches = [];
                    
                    const homeRole = extractRole(activeMatch.home);
                    const awayRole = extractRole(activeMatch.away);

                    tournament.scheduledMatches.push({
                        matchId: activeMatchId,
                        channelId: message.channelId,
                        unlockAt: targetUnlockDate,
                        homeRole: homeRole,
                        awayRole: awayRole,
                        triggered: false
                    });

                    tournament.markModified('scheduledMatches');
                    await tournament.save();

                    // REMOVE ADMINISTRATIVE TRIGGER MESSAGE TO KEEP STADIUM VENUE LOOKING CLEAN
                    await message.delete().catch(() => null);

                    // BROADCAST CUSTOMIZED LAUNCH PREVIEW PREPARATIONS CONTENT
                    return message.channel.send(
                        `## ${homeRole} <:vs:1556294619711414312> ${awayRole}\n` +
                        `### <:annc:1556295358177480725> <t:${targetTimestamp}:F>\n`
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
                                    },
                                    {
                                      name:
                                            '👥 Staff Role',

                                      value:
                                            tournament.staffRoleId ? `<@&${tournament.staffRoleId}>` : '**Not Set**',

                                      inline:
                                            true
                                    }    
                                )
                                .setFooter({
                                    text:
                                        'Use -panel overs, -panel staff, -panel reps, -panel fd or -panel rd to change settings.'
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
                    // -panel staff <@role / roleID / roleName>
                    // ==========================================
                    if (panelType === 'staff') {
                        const roleInput = args.join(' ').trim();
                        if (!roleInput) {
                            return message.reply('❌ **Usage Error:** Provide a role mention, ID, or name.\nExample: `-panel staff @Staff`');
                        }

                        // Parse by mention, explicit ID, or case-insensitive matching name string
                        const targetRole = message.mentions.roles.first() || 
                                           message.guild.roles.cache.get(roleInput) || 
                                           message.guild.roles.cache.find(r => r.name.toLowerCase() === roleInput.toLowerCase());

                        if (!targetRole) {
                            return message.reply('❌ **Error:** That role could not be found in this server.');
                        }

                        tournament.staffRoleId = targetRole.id;
                        await tournament.save();

                        const embed = new EmbedBuilder()
                            .setTitle('⚙️ Match Settings Updated')
                            .setColor('#2ECC71')
                            .setDescription(`The tournament staff role has been successfully set to ${targetRole}.\n\nMembers holding this role can now lock/unlock channels via \`-annc\` without needing global bot access layout permissions.`)
                            .setTimestamp();

                        return message.reply({ embeds: [embed] });
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
                                    `${index + 1}. *Hidden*\n`;
                            }
                        );

                        hiddenOutput += '\n';
                    }
                );

                hiddenOutput +=
                    '🏆 **What is the tournament Format?** Type **UCL** or **Round Robin**.';

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

                const chosenFormat =
                    rawInput.toLowerCase();

                if (
                    chosenFormat.includes(
                        'ucl'
                    )
                ) {

                    activeSetup.format =
                        'ucl';

                    activeSetup.status =
                        'setup_ucl_matches';

                    await activeSetup.save();

                    return message.reply(
                        '🏆 **UCL Style Selected.**\n' +
                        'How many matches should each team play? (This decides total matchdays)'
                    );
                }

                if (
                    chosenFormat.includes(
                        'round'
                    ) ||
                    chosenFormat.includes(
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
                            `<:annc:1556295358177480725> **Match Time<a:mark:1556295747186458654>**\n` +
                            `${sched.homeRole} <:vs:1556294619711414312> ${sched.awayRole}`
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
