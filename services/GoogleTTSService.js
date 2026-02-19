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
                    languageCodes: ['ko-KR'],
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

            const response = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                {
                    input: { text },
                    voice: voiceConfig,
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate: Math.min(Math.max(speed, 0.25), 4.0)
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
        return CHIRP3_HD_VOICES;
    }
}

module.exports = new GoogleTTSService();
