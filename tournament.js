const mongoose = require('mongoose');

const TournamentSchema = new mongoose.Schema({
    // Discord Context Elements
    guildId: {
        type: String,
        required: true
    },

    channelId: {
        type: String,
        required: true
    },

    setupUser: {
        type: String,
        required: true
    },

    // Tournament Workspace Identity
    name: {
        type: String,
        required: true
    },

    isActive: {
        type: Boolean,
        default: false
    },

    // Setup Wizard Constraints
    status: {
        type: String,
        enum: [
            'setup_teams',
            'setup_groups',
            'ask_draw_display',
            'setup_format',
            'setup_ucl_matches',
            'setup_rr_rounds',
            'complete'
        ],
        default: 'setup_teams'
    },

    format: {
        type: String,
        enum: ['ucl', 'round_robin', null],
        default: null
    },

    rounds: {
        type: String,
        enum: ['single', 'double', null],
        default: null
    },

    teamsCount: {
        type: Number,
        default: 0
    },

    groupsCount: {
        type: Number,
        default: 1
    },

    totalMatchdays: {
        type: Number,
        default: 0
    },

    // Fixed creation / generation date anchor
    startDate: {
        type: Date,
        default: null
    },

    // ==========================================
    // MATCH SETTINGS
    // ==========================================

    // Number of overs per match
    overs: {
        type: Number,
        default: 20
    },

    // Reps setting
    reps: {
        type: String,
        enum: ['allowed', 'not allowed'],
        default: 'allowed'
    },

    // ==========================================
    // DEADLINE SETTINGS
    // ==========================================

    // Matchday 1 deadline.
    //
    // 1 = normal 1-day deadline
    // 2 = 2-day deadline
    // 3 = 3-day deadline
    //
    // Default = 1
    firstDayDeadlineDays: {
        type: Number,
        default: 1
    },

    // Reserve deadline after the FINAL matchday.
    //
    // Default = 2 days
    reserveDeadlineDays: {
        type: Number,
        default: 2
    },

    // ==========================================
    // CORE DATA
    // ==========================================

    teamNames: {
        type: [String],
        default: []
    },

    // ==========================================
    // LIVE DRAW SYSTEM
    // ==========================================

    // Whether the tournament currently has
    // an active Live Draw after generation.
    liveDraws: {
        type: Boolean,
        default: false
    },

    // Stores the randomized teams inside each group.
    //
    // Example:
    // {
    //     A: ['team1', 'team2'],
    //     B: ['team3', 'team4']
    // }
    drawGroups: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Stores how many teams have been revealed
    // from each group.
    //
    // Example:
    // {
    //     A: 2,
    //     B: 0
    // }
    drawRevealState: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // ==========================================
    // FIXTURES / MATCH DATA
    // ==========================================

    fixtures: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },

    matchRegistry: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Reserved matches
    //
    // Example:
    // "123456789_15": true
    //
    reservedMatches: {
        type: Map,
        of: Boolean,
        default: {}
    },

    // Legacy reservation storage
    reservations: {
        type: Map,
        of: Boolean,
        default: {}
    },

    matchTimes: {
        type: Map,
        of: String,
        default: {}
    },

    matchChannels: {
        type: Map,
        of: String,
        default: {}
    },

    alertedMatches: {
        type: Map,
        of: Boolean,
        default: {}
    },

    endedMatches: {
        type: Map,
        of: Boolean,
        default: {}
    },

    staffRoleId: {
        type: String,
        default: ''
    },

    staffChannelId: {
        type: String,
        default: ''
    },

    trustedSourceId: {
        type: String,
        default: ''
    }

}, {
    timestamps: true
});

// Unique tournament names per Discord server
TournamentSchema.index(
    { guildId: 1, name: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    'Tournament',
    TournamentSchema
);