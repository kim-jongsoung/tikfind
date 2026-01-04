const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('🔍 Google OAuth 콜백 시작');
        console.log('📧 이메일:', profile.emails[0].value);
        console.log('🆔 Google ID:', profile.id);
        
        const email = profile.emails[0].value;
        const googleId = profile.id;

        let user = await User.findOne({ googleId });

        if (user) {
            console.log('✅ 기존 사용자 찾음 (Google ID)');
            return done(null, user);
        }

        user = await User.findOne({ email });

        if (user) {
            console.log('✅ 기존 사용자 찾음 (이메일) - Google 계정 병합');
            user.googleId = googleId;
            user.authProvider = 'google';
            if (!user.profileImage && profile.photos && profile.photos.length > 0) {
                user.profileImage = profile.photos[0].value;
            }
            if (!user.nickname && profile.displayName) {
                user.nickname = profile.displayName;
            }
            await user.save();
            console.log('✅ 사용자 정보 업데이트 완료');
            return done(null, user);
        }

        console.log('🆕 신규 사용자 생성 중...');
        const newUser = await User.create({
            email,
            googleId,
            authProvider: 'google',
            nickname: profile.displayName || email.split('@')[0],
            profileImage: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : ''
        });
        console.log('✅ 신규 사용자 생성 완료:', newUser._id);

        return done(null, newUser);
    } catch (error) {
        console.error('❌ Google OAuth Error:', error);
        console.error('❌ Error Stack:', error.stack);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;
