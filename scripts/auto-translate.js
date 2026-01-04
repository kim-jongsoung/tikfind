const fs = require('fs');
const path = require('path');
const https = require('https');

// Google Translate API 무료 대안 (translate-google 패키지 사용)
// 또는 LibreTranslate 무료 API 사용

const LANGUAGES = {
    'ko': 'Korean',
    'ja': 'Japanese', 
    'es': 'Spanish',
    'zh-TW': 'Chinese (Traditional)',
    'vi': 'Vietnamese'
};

// LibreTranslate 무료 API 사용 (설치 불필요)
async function translateText(text, targetLang) {
    // 언어 코드 매핑
    const langMap = {
        'ko': 'ko',
        'ja': 'ja',
        'es': 'es',
        'zh-TW': 'zh',
        'vi': 'vi'
    };

    const data = JSON.stringify({
        q: text,
        source: 'en',
        target: langMap[targetLang],
        format: 'text'
    });

    const options = {
        hostname: 'libretranslate.de',
        port: 443,
        path: '/translate',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    resolve(result.translatedText || text);
                } catch (e) {
                    console.error(`Translation error for "${text}":`, e.message);
                    resolve(text); // Fallback to original
                }
            });
        });

        req.on('error', (e) => {
            console.error(`Request error: ${e.message}`);
            resolve(text); // Fallback to original
        });

        req.write(data);
        req.end();
    });
}

// 딜레이 함수 (API rate limit 방지)
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateKeys(enKeys, targetLang) {
    console.log(`\n🌍 Translating to ${LANGUAGES[targetLang]}...`);
    const translated = {};
    let count = 0;
    const total = Object.keys(enKeys).length;

    for (const [key, value] of Object.entries(enKeys)) {
        count++;
        process.stdout.write(`\r  Progress: ${count}/${total} (${Math.round(count/total*100)}%)`);
        
        // 번역 실행
        translated[key] = await translateText(value, targetLang);
        
        // API rate limit 방지 (500ms 딜레이)
        await delay(500);
    }
    
    console.log(`\n  ✅ ${LANGUAGES[targetLang]} translation completed!`);
    return translated;
}

async function main() {
    console.log('🚀 Starting auto-translation process...\n');

    // i18n.js에서 영어 키 읽기
    const i18nPath = path.join(__dirname, '../public/js/i18n.js');
    const i18nContent = fs.readFileSync(i18nPath, 'utf8');
    
    // 영어 번역 객체 추출 (정규식 사용)
    const enMatch = i18nContent.match(/en:\s*{([^}]+(?:{[^}]*}[^}]*)*?)},\s*ko:/s);
    if (!enMatch) {
        console.error('❌ Could not find English translations in i18n.js');
        process.exit(1);
    }

    // 영어 키-값 파싱
    const enSection = enMatch[1];
    const enKeys = {};
    const keyRegex = /(\w+):\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let match;
    
    while ((match = keyRegex.exec(enSection)) !== null) {
        enKeys[match[1]] = match[2].replace(/\\"/g, '"');
    }

    console.log(`📝 Found ${Object.keys(enKeys).length} English keys\n`);

    // locales 폴더 생성
    const localesDir = path.join(__dirname, '../locales');
    if (!fs.existsSync(localesDir)) {
        fs.mkdirSync(localesDir, { recursive: true });
    }

    // 영어 파일 저장
    fs.writeFileSync(
        path.join(localesDir, 'en.json'),
        JSON.stringify(enKeys, null, 2),
        'utf8'
    );
    console.log('✅ en.json created');

    // 각 언어별 번역 실행
    for (const [langCode, langName] of Object.entries(LANGUAGES)) {
        try {
            const translated = await translateKeys(enKeys, langCode);
            
            // JSON 파일로 저장
            fs.writeFileSync(
                path.join(localesDir, `${langCode}.json`),
                JSON.stringify(translated, null, 2),
                'utf8'
            );
            
            console.log(`✅ ${langCode}.json created\n`);
        } catch (error) {
            console.error(`❌ Error translating ${langName}:`, error.message);
        }
    }

    console.log('\n🎉 Auto-translation completed!');
    console.log('📁 Translation files saved in: /locales');
    console.log('\n💡 Next steps:');
    console.log('   1. Review translations in /locales folder');
    console.log('   2. Manually adjust important marketing phrases');
    console.log('   3. Run: npm run update-i18n to update i18n.js');
}

main().catch(console.error);
