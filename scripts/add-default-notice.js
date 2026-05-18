const mongoose = require('mongoose');
const User = require('../models/User');
const OverlayNotice = require('../models/OverlayNotice');

require('dotenv').config();

const DEFAULT_NOTICE = '신청곡은 팔로워 팀가입후 #노래제목#가수명 을 채팅창에 입력해주세요.';

async function addDefaultNotice() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tikfind');
        console.log('✅ MongoDB 연결 성공');

        const users = await User.find({});
        console.log(`👥 총 ${users.length}명의 사용자를 확인했습니다.`);

        let addedCount = 0;
        let skippedCount = 0;

        for (const user of users) {
            const existingNotice = await OverlayNotice.findOne({
                userId: user._id,
                content: DEFAULT_NOTICE
            });

            if (!existingNotice) {
                await OverlayNotice.create({
                    userId: user._id,
                    content: DEFAULT_NOTICE,
                    order: 0,
                    isActive: true
                });
                console.log(`✅ ${user.email}에게 디폴트 공지 추가 완료`);
                addedCount++;
            } else {
                console.log(`⏭️  ${user.email} - 이미 디폴트 공지 존재, 스킵`);
                skippedCount++;
            }
        }

        console.log('\n📊 결과:');
        console.log(`추가됨: ${addedCount}명`);
        console.log(`스킵됨: ${skippedCount}명`);

        process.exit(0);
    } catch (error) {
        console.error('❌ 오류:', error);
        process.exit(1);
    }
}

addDefaultNotice();
