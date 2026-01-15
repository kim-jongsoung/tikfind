/**
 * 브라우저에서 시간대와 언어를 자동으로 감지하여 Google 로그인 링크에 추가
 */
(function() {
    // 사용자의 시간대 감지
    function detectTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (error) {
            console.error('시간대 감지 실패:', error);
            return 'UTC';
        }
    }

    // 사용자의 언어 감지 및 매핑
    function detectLanguage() {
        try {
            const browserLang = navigator.language || navigator.userLanguage;
            console.log('🌐 브라우저 언어:', browserLang);
            
            // 언어 코드 매핑 (ko-KR -> ko, en-US -> en 등)
            const langMap = {
                'ko': 'ko',
                'ko-KR': 'ko',
                'en': 'en',
                'en-US': 'en',
                'en-GB': 'en',
                'ja': 'ja',
                'ja-JP': 'ja',
                'zh': 'zh',
                'zh-CN': 'zh',
                'zh-TW': 'zh'
            };
            
            // 정확한 매칭 시도
            if (langMap[browserLang]) {
                return langMap[browserLang];
            }
            
            // 언어 코드만 추출 (예: en-US -> en)
            const shortLang = browserLang.split('-')[0];
            return langMap[shortLang] || 'en'; // 기본값: 영어
        } catch (error) {
            console.error('언어 감지 실패:', error);
            return 'en';
        }
    }

    // 페이지 로드 시 모든 Google 로그인 링크에 시간대와 언어 추가
    document.addEventListener('DOMContentLoaded', function() {
        const timezone = detectTimezone();
        const language = detectLanguage();
        
        console.log('🌍 감지된 시간대:', timezone);
        console.log('🌐 감지된 언어:', language);

        // 모든 Google 로그인 링크 찾기
        const googleAuthLinks = document.querySelectorAll('a[href^="/auth/google"]');
        
        googleAuthLinks.forEach(link => {
            const url = new URL(link.href, window.location.origin);
            url.searchParams.set('timezone', timezone);
            url.searchParams.set('language', language);
            link.href = url.toString();
        });

        console.log(`✅ ${googleAuthLinks.length}개의 Google 로그인 링크에 시간대와 언어 추가됨`);
    });
})();
