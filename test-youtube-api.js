const axios = require('axios');

async function testYouTubeAPI() {
    try {
        console.log('🔍 YouTube API 테스트 시작...');
        
        const response = await axios.post('http://localhost:3001/api/youtube/search', {
            title: 'Dynamite',
            artist: 'BTS'
        });
        
        console.log('✅ 응답 성공:', response.data);
    } catch (error) {
        console.error('❌ 에러:', error.message);
        if (error.response) {
            console.error('❌ 응답 데이터:', error.response.data);
        }
    }
}

testYouTubeAPI();
