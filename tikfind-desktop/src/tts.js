/**
 * TikFind Desktop Collector - TTS (Text-to-Speech)
 */

const say = require('say');
const https = require('https');

const WAVENET_VOICES = [
    'ko-KR-Wavenet-A', // 여성
    'ko-KR-Wavenet-B', // 여성
    'ko-KR-Wavenet-C', // 남성
    'ko-KR-Wavenet-D'  // 남성
];

class TTSService {
    constructor() {
        this.enabled = true;  // TTS 기본 활성화
        this.language = 'ko-KR';
        this.voice = 'female';
        this.speed = 1.0;
        this.queue = [];
        this.isPlaying = false;
        // Google TTS 설정
        this.googleTTS = {
            enabled: false,
            apiKey: '',
            defaultSpeed: 1.0,
            voiceSettings: [] // [{ tiktokUniqueId, chirpVoice, speed }]
        };
    }

    updateGoogleTTSSettings(googleTTS) {
        if (!googleTTS) return;
        this.googleTTS.enabled = googleTTS.enabled || false;
        this.googleTTS.apiKey = googleTTS.apiKey || '';
        this.googleTTS.defaultSpeed = googleTTS.defaultSpeed || 1.0;
        this.googleTTS.voiceSettings = googleTTS.voiceSettings || [];
        console.log(`🔊 Google TTS ${this.googleTTS.enabled ? '활성화' : '비활성화'} | VIP ${this.googleTTS.voiceSettings.length}명`);
    }

    getAutoWaveNetVoice(uniqueId) {
        let hash = 0;
        const str = uniqueId || 'default';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return WAVENET_VOICES[Math.abs(hash) % WAVENET_VOICES.length];
    }

    async speakWithGoogleTTS(text, uniqueId) {
        return new Promise((resolve) => {
            try {
                const vipSetting = this.googleTTS.voiceSettings.find(v => v.tiktokUniqueId === uniqueId);
                const speed = vipSetting?.speed || this.googleTTS.defaultSpeed || 1.0;

                let voiceConfig;
                if (vipSetting?.chirpVoice) {
                    voiceConfig = { languageCodes: ['ko-KR'], name: `ko-KR-Chirp3-HD-${vipSetting.chirpVoice}` };
                    console.log(`🎙️ Chirp3 HD: ${vipSetting.chirpVoice} | @${uniqueId}`);
                } else {
                    const waveNetVoice = this.getAutoWaveNetVoice(uniqueId);
                    voiceConfig = { languageCode: 'ko-KR', name: waveNetVoice };
                    console.log(`🔊 WaveNet: ${waveNetVoice} | @${uniqueId}`);
                }

                const body = JSON.stringify({
                    input: { text },
                    voice: voiceConfig,
                    audioConfig: { audioEncoding: 'MP3', speakingRate: Math.min(Math.max(speed, 0.25), 4.0) }
                });

                const options = {
                    hostname: 'texttospeech.googleapis.com',
                    path: `/v1/text:synthesize?key=${this.googleTTS.apiKey}`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (json.audioContent) {
                                this.playMp3Buffer(Buffer.from(json.audioContent, 'base64'), resolve);
                            } else {
                                console.error('❌ Google TTS 응답 오류:', json.error?.message);
                                resolve();
                            }
                        } catch (e) { resolve(); }
                    });
                });
                req.on('error', (e) => { console.error('❌ Google TTS 요청 오류:', e.message); resolve(); });
                req.write(body);
                req.end();
            } catch (e) { console.error('❌ Google TTS 오류:', e.message); resolve(); }
        });
    }

    playMp3Buffer(buffer, callback) {
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');
        const os = require('os');

        const tmpFile = path.join(os.tmpdir(), `tikfind_tts_${Date.now()}.mp3`);
        fs.writeFileSync(tmpFile, buffer);

        const psCommand = `Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]'${tmpFile}'); $p.Play(); Start-Sleep -Milliseconds 8000; $p.Close()`;
        exec(`powershell -Command "${psCommand}"`, () => {
            setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch (e) {} }, 12000);
            if (callback) callback();
        });
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
    
    speak(text, uniqueId) {
        if (!this.enabled) return;
        
        // 텍스트 정제
        const cleanedText = this.cleanText(text);
        
        // 정제 후 텍스트가 비어있으면 무시
        if (!cleanedText) {
            console.log('🔇 TTS 건너뜀 (기호/이모티콘만 포함)');
            return;
        }
        
        // 큐에 추가 (uniqueId 포함)
        this.queue.push({ text: cleanedText, uniqueId: uniqueId || 'unknown' });
        
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
        const item = this.queue.shift();
        
        try {
            if (this.googleTTS.enabled && this.googleTTS.apiKey) {
                await this.speakWithGoogleTTS(item.text, item.uniqueId);
            } else {
                await this.speakText(item.text);
            }
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
