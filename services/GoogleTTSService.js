/**
 * Google TTS 서비스
 * - VIP 아이디 → Chirp 3 HD (고품질, 20가지 목소리)
 * - 일반 아이디 → WaveNet (무료 400만자/월, 아이디 해시로 자동 배정)
 */

const axios = require('axios');

const CHIRP3_HD_VOICES = [
    'Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina',
    'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iocaste',
    'Laomedeia', 'Leda', 'Orus', 'Pulcherrima', 'Schedar',
    'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi'
];

const CHIRP3_HD_GENDER = {
    'Achernar':      'F',
    'Aoede':         'F',
    'Autonoe':       'F',
    'Callirrhoe':    'F',
    'Despina':       'F',
    'Enceladus':     'M',
    'Erinome':       'F',
    'Fenrir':        'M',
    'Gacrux':        'M',
    'Iocaste':       'F',
    'Laomedeia':     'F',
    'Leda':          'F',
    'Orus':          'M',
    'Pulcherrima':   'F',
    'Schedar':       'M',
    'Sulafat':       'M',
    'Umbriel':       'M',
    'Vindemiatrix':  'F',
    'Zephyr':        'M',
    'Zubenelgenubi': 'M'
};

const WAVENET_VOICES = [
    'ko-KR-Wavenet-A', // 여성
    'ko-KR-Wavenet-B', // 여성
    'ko-KR-Wavenet-C', // 남성
    'ko-KR-Wavenet-D'  // 남성
];

class GoogleTTSService {
    constructor() {
        this.apiKey = process.env.GOOGLE_TTS_API_KEY;
        this.baseUrl = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    }

    /**
     * 아이디 해시로 WaveNet 목소리 자동 배정 (저장 없이 항상 동일한 목소리)
     */
    getAutoVoice(uniqueId) {
        let hash = 0;
        const str = uniqueId || 'default';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return WAVENET_VOICES[Math.abs(hash) % WAVENET_VOICES.length];
    }

    /**
     * TTS 음성 합성
     * @param {string} text - 읽을 텍스트
     * @param {string} uniqueId - 시청자 아이디
     * @param {string|null} chirpVoice - VIP 지정 Chirp3 HD 목소리명 (없으면 WaveNet 자동)
     * @param {number} speed - 속도 (0.25 ~ 4.0, 기본 1.0)
     * @returns {Buffer|null} - MP3 오디오 버퍼
     */
    async synthesize(text, uniqueId, chirpVoice = null, speed = 1.0) {
        if (!this.apiKey) {
            console.error('❌ GOOGLE_TTS_API_KEY가 설정되지 않았습니다.');
            return null;
        }
        if (!text || !text.trim()) return null;

        try {
            let voiceConfig;

            if (chirpVoice && CHIRP3_HD_VOICES.includes(chirpVoice)) {
                voiceConfig = {
                    languageCode: 'ko-KR',
                    name: `ko-KR-Chirp3-HD-${chirpVoice}`
                };
                console.log(`🎙️ Chirp3 HD: ${chirpVoice} | @${uniqueId}`);
            } else {
                const waveNetVoice = this.getAutoVoice(uniqueId);
                voiceConfig = {
                    languageCode: 'ko-KR',
                    name: waveNetVoice
                };
                console.log(`🔊 WaveNet: ${waveNetVoice} | @${uniqueId}`);
            }

            const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const isChirp = chirpVoice && CHIRP3_HD_VOICES.includes(chirpVoice);
            // WaveNet만 SSML 지원 - 음정 +15%, 밝고 씩씩한 느낌
            const inputPayload = isChirp
                ? { text }
                : { ssml: `<speak><prosody pitch="+15%" rate="${Math.min(Math.max(speed, 0.25), 4.0) * 100}%" volume="loud">${safeText}</prosody></speak>` };

            const response = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                {
                    input: inputPayload,
                    voice: voiceConfig,
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate: isChirp ? Math.min(Math.max(speed, 0.25), 4.0) : 1.0,
                        volumeGainDb: 6.0
                    }
                },
                { timeout: 10000 }
            );

            if (response.data?.audioContent) {
                return Buffer.from(response.data.audioContent, 'base64');
            }
            return null;
        } catch (error) {
            console.error('❌ Google TTS 오류:', error.response?.data || error.message);
            return null;
        }
    }

    getChirp3Voices() {
        return CHIRP3_HD_VOICES.map(name => ({
            name,
            gender: CHIRP3_HD_GENDER[name] || 'M'
        }));
    }
}

module.exports = new GoogleTTSService();
