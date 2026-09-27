const mongoose = require('mongoose');

const TournamentSchema = new mongoose.Schema(
    {
        // ==========================================
        // DISCORD CONTEXT
        // ==========================================

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

        // ==========================================
        // TOURNAMENT WORKSPACE IDENTITY
        // ==========================================

        name: {
            type: String,
            required: true
        },

        isActive: {
            type: Boolean,
            default: false
        },

        // ==========================================
        // SETUP WIZARD
        // ==========================================

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

        // Fixed tournament creation / generation date
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

        // Matchday 1 deadline:
        // 1 = normal 1-day deadline
        // 2 = 2-day deadline
        // 3 = 3-day deadline
        //
        // Default = 1 day
        firstDayDeadlineDays: {
            type: Number,
            default: 1
        },

        // Reserve deadline after the FINAL matchday
        //
        // Default = 2 days
        reserveDeadlineDays: {
            type: Number,
            default: 2
        },

        // ==========================================
        // CORE TEAM DATA
        // ==========================================

        teamNames: {
            type: [String],
            default: []
        },

        // ==========================================
        // LIVE DRAW SYSTEM
        // ==========================================

        // Whether the tournament currently has
        // an active Live Draw after generation
        liveDraws: {
            type: Boolean,
            default: false
        },

        // Stores randomized teams inside each group.
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

        // Matchday fixtures
        //
        // Example:
        // {
        //     day_1: [...]
        //     day_2: [...]
        // }
        fixtures: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        },

        // Registry for generated / tracked matches
        matchRegistry: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        },

        // ==========================================
        // SCHEDULED MATCHES
        // ==========================================

        // Stores matches that are scheduled to unlock.
        //
        // Example object:
        // {
        //     matchId,
        //     channelId,
        //     unlockAt: Date,
        //     homeRole,
        //     awayRole,
        //     triggered: false
        // }
        scheduledMatches: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },

        // ==========================================
        // RESERVED MATCHES
        // ==========================================

        // Reserved matches
        //
        // Example:
        // "123456789_15": true
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

        // ==========================================
        // MATCH TIMING / CHANNEL DATA
        // ==========================================

        // Example:
        // "123456789_15": "25/08/2026 7:20PM"
        matchTimes: {
            type: Map,
            of: String,
            default: {}
        },

        // Example:
        // "123456789_15": "channelId"
        matchChannels: {
            type: Map,
            of: String,
            default: {}
        },

        // Tracks whether a match has already triggered an alert
        alertedMatches: {
            type: Map,
            of: Boolean,
            default: {}
        },

        // Tracks ended matches
        endedMatches: {
            type: Map,
            of: Boolean,
            default: {}
        },

        // ==========================================
        // STAFF / TRUSTED SOURCE
        // ==========================================

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
    },
    {
        timestamps: true
    }
);

// ==========================================
// UNIQUE TOURNAMENT NAMES PER DISCORD SERVER
// ==========================================

TournamentSchema.index(
    { guildId: 1, name: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    'Tournament',
    TournamentSchema
);
