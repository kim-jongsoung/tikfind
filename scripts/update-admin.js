/**
 * 어드민 계정 이메일/패스워드 업데이트 스크립트
 * 실행: node scripts/update-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const NEW_EMAIL = 'kmtour@naver.com';
const NEW_PASSWORD = 'mstour0110@';
const NEW_NAME = 'Admin';

async function updateAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ MongoDB 연결 성공');

        // 기존 어드민 계정 전체 조회
        const admins = await Admin.find({});
        console.log('현재 어드민 계정 수:', admins.length);
        admins.forEach(a => console.log(' -', a.email, '|', a.role));

        if (admins.length === 0) {
            // 어드민 계정이 없으면 새로 생성
            const newAdmin = new Admin({
                email: NEW_EMAIL,
                password: NEW_PASSWORD,
                name: NEW_NAME,
                role: 'superadmin',
                isActive: true
            });
            await newAdmin.save();
            console.log('✅ 새 어드민 계정 생성 완료:', NEW_EMAIL);
        } else {
            // 기존 첫 번째 어드민 계정 업데이트
            const admin = admins[0];
            admin.email = NEW_EMAIL;
            admin.password = NEW_PASSWORD;
            admin.name = NEW_NAME;
            admin.role = 'superadmin';
            admin.isActive = true;
            admin.loginAttempts = 0;
            admin.lockUntil = undefined;
            await admin.save();
            console.log('✅ 어드민 계정 업데이트 완료:', NEW_EMAIL);

            // 나머지 어드민 계정 삭제 (있다면)
            if (admins.length > 1) {
                const otherIds = admins.slice(1).map(a => a._id);
                await Admin.deleteMany({ _id: { $in: otherIds } });
                console.log('🗑️ 나머지 어드민 계정 삭제:', otherIds.length, '개');
            }
        }

        console.log('\n✅ 완료!');
        console.log('  이메일:', NEW_EMAIL);
        console.log('  패스워드:', NEW_PASSWORD);
    } catch (err) {
        console.error('❌ 오류:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

updateAdmin();
