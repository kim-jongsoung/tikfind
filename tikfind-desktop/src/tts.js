/**
 * TikFind Desktop Collector - TTS (Text-to-Speech)
 */

const say = require('say');

class TTSService {
    constructor() {
        this.enabled = true;  // TTS 기본 활성화
        this.language = 'ko-KR';
        this.voice = 'female';
        this.speed = 1.0;
        this.queue = [];
        this.isPlaying = false;
    }
    
    updateSettings(settings) {
        if (settings.enabled !== undefined) {
            this.enabled = settings.enabled;
        }
        if (settings.language) {
            this.language = settings.language;
        }
        if (settings.voice) {
            this.voice = settings.voice;
        }
        if (settings.speed) {
            this.speed = settings.speed;
        }
        
        console.log('🔊 TTS 설정 업데이트:', {
            enabled: this.enabled,
            voice: this.voice,
            speed: this.speed
        });
    }
    
    // 텍스트 정제 (기호, 부호, 이모티콘 제거)
    cleanText(text) {
        if (!text) return '';
        
        let cleaned = text;
        
        // 이모티콘 제거 (유니코드 이모티콘)
        cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // 감정 이모티콘
        cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // 기호 & 픽토그램
        cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // 교통 & 지도
        cleaned = cleaned.replace(/[\u{1F700}-\u{1F77F}]/gu, ''); // 연금술 기호
        cleaned = cleaned.replace(/[\u{1F780}-\u{1F7FF}]/gu, ''); // 기하학 도형
        cleaned = cleaned.replace(/[\u{1F800}-\u{1F8FF}]/gu, ''); // 보조 기호
        cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // 보조 기호 및 픽토그램
        cleaned = cleaned.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // 체스 기호
        cleaned = cleaned.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // 기호 및 픽토그램 확장-A
        cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, '');   // 기타 기호
        cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');   // 딩뱃
        
        // 특수 기호 제거
        cleaned = cleaned.replace(/[#@$%^&*()_+=\[\]{};:'",.<>?\/\\|`~]/g, '');
        
        // 하이픈, 대시 제거
        cleaned = cleaned.replace(/[-–—]/g, ' ');
        
        // 느낌표, 물음표는 유지하되 연속된 것은 하나로
        cleaned = cleaned.replace(/!+/g, '!');
        cleaned = cleaned.replace(/\?+/g, '?');
        
        // 여러 공백을 하나로
        cleaned = cleaned.replace(/\s+/g, ' ');
        
        // 앞뒤 공백 제거
        cleaned = cleaned.trim();
        
        return cleaned;
    }
    
    speak(text) {
        if (!this.enabled) return;
        
        // 텍스트 정제
        const cleanedText = this.cleanText(text);
        
        // 정제 후 텍스트가 비어있으면 무시
        if (!cleanedText) {
            console.log('🔇 TTS 건너뜀 (기호/이모티콘만 포함)');
            return;
        }
        
        // 큐에 추가
        this.queue.push(cleanedText);
        
        // 재생 중이 아니면 시작
        if (!this.isPlaying) {
            this.processQueue();
        }
    }
    
    async processQueue() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            return;
        }
        
        this.isPlaying = true;
        const text = this.queue.shift();
        
        try {
            await this.speakText(text);
        } catch (error) {
            console.error('❌ TTS 오류:', error);
        }
        
        // 다음 텍스트 재생
        this.processQueue();
    }
    
    detectLanguage(text) {
        // 언어 자동 감지
        if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text)) {
            return 'ko-KR'; // 한국어
        } else if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
            return 'ja-JP'; // 일본어
        } else if (/[\u4E00-\u9FFF]/.test(text)) {
            return 'zh-CN'; // 중국어
        } else if (/[а-яА-ЯёЁ]/.test(text)) {
            return 'ru-RU'; // 러시아어
        } else if (/[àâäéèêëïîôùûüÿæœç]/.test(text)) {
            return 'fr-FR'; // 프랑스어
        } else if (/[áéíóúüñ¿¡]/.test(text)) {
            return 'es-ES'; // 스페인어
        } else if (/[äöüß]/.test(text)) {
            return 'de-DE'; // 독일어
        } else {
            return 'en-US'; // 영어 (기본)
        }
    }
    
    getVoiceForLanguage(language) {
        // Windows SAPI 음성 매핑
        const voices = {
            'ko-KR': 'Microsoft Heami Desktop',
            'ja-JP': 'Microsoft Haruka Desktop',
            'zh-CN': 'Microsoft Huihui Desktop',
            'en-US': 'Microsoft Zira Desktop',
            'en-GB': 'Microsoft Hazel Desktop',
            'fr-FR': 'Microsoft Hortense Desktop',
            'de-DE': 'Microsoft Hedda Desktop',
            'es-ES': 'Microsoft Helena Desktop',
            'ru-RU': 'Microsoft Irina Desktop'
        };
        
        return voices[language] || null; // 없으면 시스템 기본
    }
    
    speakText(text) {
        return new Promise((resolve, reject) => {
            console.log(`🔊 TTS: ${text}`);
            
            // Windows TTS - 다국어 자동 감지
            if (process.platform === 'win32') {
                const { exec } = require('child_process');
                const rate = Math.round((this.speed - 1) * 10); // -10 ~ 10 범위로 변환
                
                // 언어 자동 감지
                const detectedLang = this.detectLanguage(text);
                const voiceName = this.getVoiceForLanguage(detectedLang);
                
                console.log(`🌍 감지된 언어: ${detectedLang}, 음성: ${voiceName || '시스템 기본'}`);
                
                // PowerShell 명령어로 TTS 실행
                let psCommand;
                if (voiceName) {
                    // 특정 음성 선택
                    psCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SelectVoice('${voiceName}'); $synth.Rate = ${rate}; $synth.Speak('${text.replace(/'/g, "''")}')`;
                } else {
                    // 시스템 기본 음성
                    psCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = ${rate}; $synth.Speak('${text.replace(/'/g, "''")}')`;
                }
                
                exec(`powershell -Command "${psCommand}"`, (err) => {
                    if (err) {
                        console.error('TTS 오류:', err);
                        // 오류 발생 시 기본 음성으로 재시도
                        const fallbackCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = ${rate}; $synth.Speak('${text.replace(/'/g, "''")}')`;
                        exec(`powershell -Command "${fallbackCommand}"`, (err2) => {
                            if (err2) {
                                reject(err2);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });
            }
            // Mac TTS
            else if (process.platform === 'darwin') {
                const voiceName = this.getMacVoice();
                say.speak(text, voiceName, this.speed, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
            // Linux TTS
            else {
                say.speak(text, null, this.speed, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
        });
    }
    
    getWindowsVoice() {
        // Windows SAPI 음성
        const voices = {
            'ko-KR': {
                'female': 'Microsoft Heami Desktop',
                'male': 'Microsoft Heami Desktop'
            },
            'en-US': {
                'female': 'Microsoft Zira Desktop',
                'male': 'Microsoft David Desktop'
            },
            'ja-JP': {
                'female': 'Microsoft Haruka Desktop',
                'male': 'Microsoft Ichiro Desktop'
            },
            'zh-CN': {
                'female': 'Microsoft Huihui Desktop',
                'male': 'Microsoft Kangkang Desktop'
            }
        };
        
        return voices[this.language]?.[this.voice] || 'Microsoft Heami Desktop';
    }
    
    getMacVoice() {
        // Mac 음성
        const voices = {
            'ko-KR': {
                'female': 'Yuna',
                'male': 'Yuna'
            },
            'en-US': {
                'female': 'Samantha',
                'male': 'Alex'
            },
            'ja-JP': {
                'female': 'Kyoko',
                'male': 'Otoya'
            },
            'zh-CN': {
                'female': 'Ting-Ting',
                'male': 'Ting-Ting'
            }
        };
        
        return voices[this.language]?.[this.voice] || 'Yuna';
    }
    
    stop() {
        this.queue = [];
        this.isPlaying = false;
        say.stop();
    }
}

module.exports = TTSService;
