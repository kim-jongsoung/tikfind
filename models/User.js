const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        select: false,
        minlength: [6, 'Password must be at least 6 characters']
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    },
    tiktokId: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    nickname: {
        type: String,
        trim: true,
        maxlength: [50, 'Nickname cannot exceed 50 characters']
    },
    profileImage: {
        type: String,
        default: ''
    },
    plan: {
        type: String,
        enum: ['free', 'pro'],
        default: 'free'
    },
    subscriptionStatus: {
        type: String,
        enum: ['trial', 'active', 'cancelled', 'expired', 'past_due'],
        default: 'trial'
    },
    trialStartDate: {
        type: Date
    },
    trialEndDate: {
        type: Date
    },
    subscriptionStartDate: {
        type: Date
    },
    subscriptionEndDate: {
        type: Date
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'superadmin'],
        default: 'user'
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    nativeLanguage: {
        type: String,
        enum: ['ko', 'en', 'ja', 'es', 'zh-TW', 'vi', 'th'],
        default: 'en'
    },
    preferredLanguage: {
        type: String,
        enum: ['ko', 'en', 'ja', 'es', 'zh-TW', 'vi', 'th'],
        default: 'ko'
    },
    streamerPersona: {
        type: String,
        trim: true,
        maxlength: [200, 'Streamer persona cannot exceed 200 characters'],
        default: ''
    },
    country: {
        type: String,
        default: 'US',
        uppercase: true,
        maxlength: 2
    },
    currency: {
        type: String,
        default: 'USD',
        uppercase: true,
        maxlength: 3
    },
    timezone: {
        type: String,
        default: 'UTC'
    },
    settings: {
        translation: {
            enabled: {
                type: Boolean,
                default: false
            },
            targetLanguage: {
                type: String,
                default: 'en'
            },
            customPrompt: {
                type: String,
                default: ''
            }
        },
        overlay: {
            theme: {
                type: String,
                enum: ['default', 'minimal', 'modern', 'neon'],
                default: 'default'
            },
            position: {
                type: String,
                enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
                default: 'bottom-right'
            },
            showWatermark: {
                type: Boolean,
                default: true
            }
        }
    },
    overlaySettings: {
        theme: {
            type: String,
            default: 'modern-dark'
        },
        fontSize: {
            type: Number,
            default: 16
        },
        animSpeed: {
            type: Number,
            default: 5
        },
        position: {
            type: String,
            default: 'bottom-left'
        },
        showCurrentSong: {
            type: Boolean,
            default: true
        },
        showQueue: {
            type: Boolean,
            default: true
        },
        showRequester: {
            type: Boolean,
            default: true
        },
        showAlbumArt: {
            type: Boolean,
            default: false
        }
    },
    usageStats: {
        totalBroadcastMinutes: {
            type: Number,
            default: 0
        },
        aiRequestsCount: {
            type: Number,
            default: 0
        },
        lastBroadcastDate: {
            type: Date
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    deletedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ tiktokId: 1 });
userSchema.index({ isAdmin: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ subscriptionStatus: 1, subscriptionEndDate: 1 });
userSchema.index({ plan: 1, isActive: 1 });

userSchema.virtual('isSetupComplete').get(function() {
    return !!this.tiktokId;
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

userSchema.pre('save', async function() {
    if (!this.isModified('password')) {
        return;
    }
    
    if (this.password) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) {
        return false;
    }
    return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

userSchema.methods.canAccessService = function() {
    return this.isSetupComplete;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
