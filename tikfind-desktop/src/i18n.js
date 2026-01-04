/**
 * TikFind Desktop - 다국어 지원 (i18n)
 */

const fs = require('fs');
const path = require('path');

class I18n {
    constructor() {
        this.locale = this.detectLocale();
        this.translations = this.loadTranslations();
    }
    
    detectLocale() {
        // Windows 언어 설정 감지
        const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
        
        // 한국어면 'ko', 그 외는 'en'
        if (systemLocale.startsWith('ko')) {
            return 'ko';
        } else if (systemLocale.startsWith('ja')) {
            return 'ja';
        } else if (systemLocale.startsWith('zh')) {
            return 'zh';
        } else {
            return 'en'; // 기본값: 영어
        }
    }
    
    loadTranslations() {
        try {
            const filePath = path.join(__dirname, '..', 'locales', `${this.locale}.json`);
            
            // 파일이 없으면 영어로 폴백
            if (!fs.existsSync(filePath)) {
                console.log(`⚠️ 언어 파일 없음: ${this.locale}, 영어로 폴백`);
                const fallbackPath = path.join(__dirname, '..', 'locales', 'en.json');
                return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
            }
            
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.error('❌ 언어 파일 로드 실패:', error);
            return {};
        }
    }
    
    t(key) {
        // 점(.) 표기법으로 중첩된 객체 접근
        // 예: t('connection.userId') -> translations.connection.userId
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object') {
                value = value[k];
            } else {
                return key; // 키를 찾지 못하면 키 자체를 반환
            }
        }
        
        return value || key;
    }
    
    getLocale() {
        return this.locale;
    }
}

module.exports = new I18n();
