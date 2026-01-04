/**
 * TikFind API 테스트 스크립트
 * AI 발음 코치, 신청곡 시스템, 구독 확인 미들웨어 테스트
 */

const axios = require('axios');

const SERVER_URL = 'http://localhost:3001';
const TEST_USER_ID = '6950e71049fd85ec7a001d6c'; // 실제 User ID

// 색상 출력
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 테스트 결과 저장
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

// 테스트 함수
async function test(name, fn) {
    try {
        log(`\n🧪 테스트: ${name}`, 'cyan');
        await fn();
        log(`✅ 통과: ${name}`, 'green');
        results.passed++;
        results.tests.push({ name, status: 'passed' });
    } catch (error) {
        log(`❌ 실패: ${name}`, 'red');
        log(`   오류: ${error.message}`, 'red');
        results.failed++;
        results.tests.push({ name, status: 'failed', error: error.message });
    }
}

// 1. AI 발음 코치 테스트
async function testPronunciationCoach() {
    await test('AI 발음 코치 - 영어 메시지', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/chat`, {
            userId: TEST_USER_ID,
            username: 'testuser',
            message: 'Hello',
            timestamp: Date.now()
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   응답 받음', 'blue');
    });

    await test('AI 발음 코치 - 일본어 메시지', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/chat`, {
            userId: TEST_USER_ID,
            username: 'testuser',
            message: 'こんにちは',
            timestamp: Date.now()
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   응답 받음', 'blue');
    });

    await test('AI 발음 코치 - 한국어 메시지 (발음 코치 불필요)', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/chat`, {
            userId: TEST_USER_ID,
            username: 'testuser',
            message: '안녕하세요',
            timestamp: Date.now()
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   응답 받음 (발음 코치 없음)', 'blue');
    });
}

// 2. 신청곡 시스템 테스트
async function testSongRequest() {
    await test('신청곡 파싱 - 정상 형식', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/chat`, {
            userId: TEST_USER_ID,
            username: 'testuser',
            message: '#Dynamite#BTS',
            uniqueId: 'testuser123',
            badges: [],
            timestamp: Date.now()
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   신청곡 파싱 성공', 'blue');
    });

    await test('신청곡 큐 조회', async () => {
        const response = await axios.get(`${SERVER_URL}/api/song-queue/${TEST_USER_ID}`);

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log(`   큐에 ${response.data.queue.length}개 곡`, 'blue');
    });

    await test('신청곡 파싱 - 한국어 노래', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/chat`, {
            userId: TEST_USER_ID,
            username: 'testuser2',
            message: '#롤린#브레이브걸스',
            uniqueId: 'testuser456',
            badges: [],
            timestamp: Date.now()
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   한국어 신청곡 파싱 성공', 'blue');
    });
}

// 3. 구독 확인 미들웨어 테스트
async function testSubscriptionMiddleware() {
    await test('구독 확인 - 유효한 사용자', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/status`, {
            userId: TEST_USER_ID,
            username: 'testuser',
            isLive: true,
            timestamp: Date.now()
        });

        if (!response.data.success) {
            throw new Error('구독 확인 실패');
        }

        log('   구독 확인 통과', 'blue');
    });

    await test('구독 확인 - 잘못된 User ID', async () => {
        try {
            await axios.post(`${SERVER_URL}/api/live/status`, {
                userId: 'invalid_user_id',
                username: 'testuser',
                isLive: true,
                timestamp: Date.now()
            });
            throw new Error('잘못된 User ID가 통과됨');
        } catch (error) {
            if (error.response && (error.response.status === 403 || error.response.status === 404)) {
                log('   올바르게 차단됨', 'blue');
            } else {
                throw error;
            }
        }
    });

    await test('구독 확인 - User ID 없음', async () => {
        try {
            await axios.post(`${SERVER_URL}/api/live/status`, {
                username: 'testuser',
                isLive: true,
                timestamp: Date.now()
            });
            throw new Error('User ID 없이 통과됨');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                log('   올바르게 차단됨 (400 Bad Request)', 'blue');
            } else {
                throw error;
            }
        }
    });
}

// 4. YouTube API 테스트
async function testYouTubeAPI() {
    await test('YouTube API - 노래 검색', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/chat`, {
            userId: TEST_USER_ID,
            username: 'testuser',
            message: '#Butter#BTS',
            uniqueId: 'testuser789',
            badges: [],
            timestamp: Date.now()
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   YouTube 검색 요청 성공', 'blue');
        
        // 큐 확인
        const queueResponse = await axios.get(`${SERVER_URL}/api/song-queue/${TEST_USER_ID}`);
        const lastSong = queueResponse.data.queue[queueResponse.data.queue.length - 1];
        
        if (lastSong && lastSong.youtubeUrl) {
            log(`   YouTube URL: ${lastSong.youtubeUrl}`, 'blue');
        }
    });
}

// 5. 시청자 수 및 선물 API 테스트
async function testOtherAPIs() {
    await test('시청자 수 업데이트', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/viewers`, {
            userId: TEST_USER_ID,
            viewerCount: 1234
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   시청자 수 업데이트 성공', 'blue');
    });

    await test('선물 수신', async () => {
        const response = await axios.post(`${SERVER_URL}/api/live/gift`, {
            userId: TEST_USER_ID,
            giftName: 'Rose',
            username: 'testuser'
        });

        if (!response.data.success) {
            throw new Error('API 응답 실패');
        }

        log('   선물 수신 성공', 'blue');
    });
}

// 메인 테스트 실행
async function runTests() {
    log('\n🚀 TikFind API 테스트 시작\n', 'cyan');
    log(`서버: ${SERVER_URL}`, 'yellow');
    log(`테스트 User ID: ${TEST_USER_ID}\n`, 'yellow');

    try {
        // 서버 연결 확인
        await axios.get(`${SERVER_URL}/api/current_user`);
        log('✅ 서버 연결 확인\n', 'green');
    } catch (error) {
        log('❌ 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.', 'red');
        process.exit(1);
    }

    // 테스트 실행
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('1. AI 발음 코치 테스트', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    await testPronunciationCoach();

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('2. 신청곡 시스템 테스트', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    await testSongRequest();

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('3. 구독 확인 미들웨어 테스트', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    await testSubscriptionMiddleware();

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('4. YouTube API 테스트', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    await testYouTubeAPI();

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('5. 기타 API 테스트', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    await testOtherAPIs();

    // 결과 출력
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('📊 테스트 결과', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log(`\n✅ 통과: ${results.passed}`, 'green');
    log(`❌ 실패: ${results.failed}`, 'red');
    log(`📝 총 테스트: ${results.passed + results.failed}\n`, 'yellow');

    if (results.failed > 0) {
        log('실패한 테스트:', 'red');
        results.tests.filter(t => t.status === 'failed').forEach(t => {
            log(`  - ${t.name}: ${t.error}`, 'red');
        });
    }

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

    if (results.failed === 0) {
        log('🎉 모든 테스트 통과!', 'green');
    } else {
        log('⚠️  일부 테스트 실패', 'yellow');
    }
}

// 실행
runTests().catch(error => {
    log(`\n❌ 테스트 실행 오류: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
