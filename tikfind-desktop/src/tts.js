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
        this.volume = 80;  // 볼륨 0~100, 기본 80
        this.queue = [];
        this.isPlaying = false;
        this._stopped = false; // 중지 플래그
        this._currentProcess = null; // 현재 실행 중인 PowerShell 프로세스
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

    getAutoWaveNetVoice(uniqueId, userGenders) {
        const gender = userGenders && userGenders[uniqueId];
        console.log(`🔍 [WaveNet] uniqueId=${uniqueId} | gender=${gender} | userGenders keys=${Object.keys(userGenders || {}).join(',')}`);
        if (gender === 'f') {
            // 여성: A, B
            const femaleVoices = ['ko-KR-Wavenet-A', 'ko-KR-Wavenet-B'];
            let hash = 0;
            const str = uniqueId || 'default';
            for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
            return femaleVoices[Math.abs(hash) % femaleVoices.length];
        } else if (gender === 'm') {
            // 남성: C, D
            const maleVoices = ['ko-KR-Wavenet-C', 'ko-KR-Wavenet-D'];
            let hash = 0;
            const str = uniqueId || 'default';
            for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
            return maleVoices[Math.abs(hash) % maleVoices.length];
        } else {
            // 미지정: 해시로 랜덤 배정
            let hash = 0;
            const str = uniqueId || 'default';
            for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
            return WAVENET_VOICES[Math.abs(hash) % WAVENET_VOICES.length];
        }
    }

    async speakWithGoogleTTS(text, uniqueId, userGenders) {
        return new Promise((resolve) => {
            try {
                const vipSetting = this.googleTTS.voiceSettings.find(v => v.tiktokUniqueId === uniqueId);
                const speed = vipSetting?.speed || this.googleTTS.defaultSpeed || 1.0;

                let voiceConfig;
                if (vipSetting?.chirpVoice) {
                    voiceConfig = { languageCode: 'ko-KR', name: `ko-KR-Chirp3-HD-${vipSetting.chirpVoice}` };
                    console.log(`🎙️ Chirp3 HD: ${vipSetting.chirpVoice} | @${uniqueId}`);
                } else {
                    const waveNetVoice = this.getAutoWaveNetVoice(uniqueId, userGenders);
                    voiceConfig = { languageCode: 'ko-KR', name: waveNetVoice };
                    const genderLabel = userGenders?.[uniqueId] === 'm' ? '남' : userGenders?.[uniqueId] === 'f' ? '여' : '랜덤';
                    console.log(`🔊 WaveNet: ${waveNetVoice} (${genderLabel}) | @${uniqueId}`);
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

        const tmpFile = path.join(os.tmpdir(), `tikfind_tts_${Date.now()}.mp3`).replace(/\\/g, '/');
        fs.writeFileSync(tmpFile, buffer);

        const vol = Math.min(Math.max(this.volume / 100, 0), 1).toFixed(2);
        // MP3 실제 재생 완료까지 대기 (NaturalDuration 사용)
        const psCommand = [
            'Add-Type -AssemblyName presentationCore;',
            '$p = New-Object System.Windows.Media.MediaPlayer;',
            `$p.Open([uri]'${tmpFile}');`,
            `$p.Volume = ${vol};`,
            '$p.Play();',
            'Start-Sleep -Milliseconds 200;',
            '$dur = $p.NaturalDuration.TimeSpan.TotalMilliseconds;',
            'if ($dur -gt 0) { Start-Sleep -Milliseconds $dur } else { Start-Sleep -Milliseconds 6000 };',
            '$p.Close();'
        ].join(' ');

        console.log(`🎵 MP3 재생 시작: ${tmpFile} (${buffer.length} bytes)`);
        exec(`powershell -Command "${psCommand}"`, (err) => {
            if (err) console.error('❌ MP3 재생 오류:', err.message);
            else console.log('✅ MP3 재생 완료');
            setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch (e) {} }, 3000);
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
        if (settings.volume !== undefined) {
            this.volume = Math.min(Math.max(parseInt(settings.volume) || 80, 0), 100);
        }
        
        console.log('🔊 TTS 설정 업데이트:', {
            enabled: this.enabled,
            voice: this.voice,
            speed: this.speed,
            volume: this.volume
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
    
    speak(text, uniqueId, userGenders) {
        if (!this.enabled || this._stopped) return;
        
        // 텍스트 정제
        const cleanedText = this.cleanText(text);
        
        // 정제 후 텍스트가 비어있으면 무시
        if (!cleanedText) {
            console.log('🔇 TTS 건너뜀 (기호/이모티콘만 포함)');
            return;
        }

        const item = { text: cleanedText, uniqueId: uniqueId || 'unknown', userGenders: userGenders || {}, bufferPromise: null };

        // ── Prefetch: 큐에 넣는 즉시 백그라운드에서 Google TTS 합성 시작 ──
        if (this.googleTTS.enabled && this.googleTTS.apiKey) {
            item.bufferPromise = this._fetchGoogleTTSBuffer(cleanedText, item.uniqueId, item.userGenders)
                .catch(() => null); // 실패해도 큐는 유지
            console.log(`⚡ Prefetch 시작: "${cleanedText}" | @${item.uniqueId}`);
        }
        
        // 큐에 추가
        this.queue.push(item);

        // 큐 최대 3개 제한 - 초과 시 오래된 것 드롭 (지연 방지)
        const MAX_QUEUE = 3;
        if (this.queue.length > MAX_QUEUE) {
            const dropped = this.queue.length - MAX_QUEUE;
            this.queue.splice(0, dropped);
            console.log(`🗑️ TTS 큐 초과 - 오래된 ${dropped}개 드롭 (남은 ${this.queue.length}개)`);
        }

        // 재생 중이 아니면 시작
        if (!this.isPlaying) {
            this.processQueue();
        }
    }

    // Google TTS API 호출만 담당 (재생 없음) → Prefetch 용
    async _fetchGoogleTTSBuffer(text, uniqueId, userGenders) {
        return new Promise((resolve, reject) => {
            try {
                const vipSetting = this.googleTTS.voiceSettings.find(v => v.tiktokUniqueId === uniqueId);
                const speed = vipSetting?.speed || this.googleTTS.defaultSpeed || 1.0;

                let voiceConfig;
                if (vipSetting?.chirpVoice) {
                    voiceConfig = { languageCode: 'ko-KR', name: `ko-KR-Chirp3-HD-${vipSetting.chirpVoice}` };
                } else {
                    const waveNetVoice = this.getAutoWaveNetVoice(uniqueId, userGenders);
                    voiceConfig = { languageCode: 'ko-KR', name: waveNetVoice };
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
                                resolve(Buffer.from(json.audioContent, 'base64'));
                            } else {
                                reject(new Error(json.error?.message || 'No audioContent'));
                            }
                        } catch (e) { reject(e); }
                    });
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            } catch (e) { reject(e); }
        });
    }
    
    async processQueue() {
        if (this.queue.length === 0 || this._stopped) {
            this.isPlaying = false;
            return;
        }
        
        this.isPlaying = true;
        const item = this.queue.shift();
        
        try {
            if (this._stopped) { this.isPlaying = false; return; }
            console.log(`🔊 TTS 처리: "${item.text}" | googleTTS.enabled=${this.googleTTS.enabled} | apiKey=${this.googleTTS.apiKey ? '있음' : '없음(빈값)'}`);
            if (this.googleTTS.enabled && this.googleTTS.apiKey) {
                // Prefetch된 버퍼가 있으면 즉시 재생, 없으면 이 시점에 합성
                const buffer = item.bufferPromise
                    ? await item.bufferPromise
                    : await this._fetchGoogleTTSBuffer(item.text, item.uniqueId, item.userGenders).catch(() => null);

                if (buffer) {
                    console.log(`🎙️ Google TTS 재생 (${item.bufferPromise ? 'prefetched' : 'live'}) | @${item.uniqueId}`);
                    await new Promise(resolve => this.playMp3Buffer(buffer, resolve));
                } else {
                    console.log(`🔈 Google TTS 실패 → 기본 TTS 폴백`);
                    await this.speakText(item.text);
                }
            } else {
                console.log(`🔈 기본 TTS 사용 (Google TTS 비활성 또는 API키 없음)`);
                await this.speakText(item.text);
            }
        } catch (error) {
            console.error('❌ TTS 오류:', error);
        }
        
        // 다음 텍스트 재생
        if (!this._stopped) this.processQueue();
        else { this.isPlaying = false; }
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
                const vol = Math.round(this.volume); // 0~100
                
                // 언어 자동 감지
                const detectedLang = this.detectLanguage(text);
                const voiceName = this.getVoiceForLanguage(detectedLang);
                
                console.log(`🌍 감지된 언어: ${detectedLang}, 음성: ${voiceName || '시스템 기본'}, 볼륨: ${vol}`);
                
                // PowerShell 명령어로 TTS 실행
                let psCommand;
                if (voiceName) {
                    psCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SelectVoice('${voiceName}'); $synth.Rate = ${rate}; $synth.Volume = ${vol}; $synth.Speak('${text.replace(/'/g, "''")}')`;  
                } else {
                    psCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = ${rate}; $synth.Volume = ${vol}; $synth.Speak('${text.replace(/'/g, "''")}')`;  
                }
                
                const proc = exec(`powershell -Command "${psCommand}"`, (err) => {
                    this._currentProcess = null;
                    if (err) {
                        console.error('TTS 오류:', err);
                        // 오류 발생 시 기본 음성으로 재시도
                        const fallbackCommand = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = ${rate}; $synth.Volume = ${vol}; $synth.Speak('${text.replace(/'/g, "''")}')`;  
                        exec(`powershell -Command "${fallbackCommand}"`, (err2) => {
                            if (err2) reject(err2);
                            else resolve();
                        });
                    } else {
                        resolve();
                    }
                });
                this._currentProcess = proc;
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
        this._stopped = true;
        this.queue = [];
        this.isPlaying = false;
        // 실행 중인 PowerShell 프로세스 강제 종료
        if (this._currentProcess) {
            try { this._currentProcess.kill(); } catch(e) {}
            this._currentProcess = null;
        }
        // Windows: powershell 프로세스 전체 종료 (say 모듈 포함)
        if (process.platform === 'win32') {
            const { exec } = require('child_process');
            exec('taskkill /F /IM powershell.exe /T', () => {});
        } else {
            try { say.stop(); } catch(e) {}
        }
        console.log('⛔ TTS 강제 중지 완료 - 큐 비움');
        // 잠시 후 _stopped 플래그 해제 (다음 방송 대비)
        setTimeout(() => { this._stopped = false; }, 3000);
    }
}

module.exports = TTSService;
