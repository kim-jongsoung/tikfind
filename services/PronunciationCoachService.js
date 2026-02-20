/**
 * AI 발음 코치 서비스
 * 외국어 채팅을 감지하고 스트리머 언어로 발음 안내 제공
 */

const OpenAI = require('openai');

class PronunciationCoachService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * 언어 감지
     */
    async detectLanguage(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Detect the language of the given text. Reply with only the language code (ko, en, ja, zh, es, etc.)'
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.3,
                max_tokens: 10
            });

            return response.choices[0].message.content.trim().toLowerCase();
        } catch (error) {
            console.error('❌ 언어 감지 오류:', error);
            return 'unknown';
        }
    }

    /**
     * 발음 코치 생성
     * @param {string} message - 시청자 메시지
     * @param {string} messageLanguage - 메시지 언어
     * @param {string} streamerLanguage - 스트리머 선택 언어
     */
    async generatePronunciationGuide(message, messageLanguage, streamerLanguage) {
        try {
            // 같은 언어면 발음 코치 불필요
            if (messageLanguage === streamerLanguage) {
                return null;
            }

            const prompt = this.buildPrompt(message, messageLanguage, streamerLanguage);

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a pronunciation coach for live streamers. Help them respond to foreign language messages by providing pronunciation guides in their native language.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 300
            });

            const result = response.choices[0].message.content.trim();
            return this.parseResponse(result, message, messageLanguage);

        } catch (error) {
            console.error('❌ 발음 코치 생성 오류:', error);
            return null;
        }
    }

    /**
     * 프롬프트 생성
     */
    buildPrompt(message, messageLanguage, streamerLanguage) {
        const languageNames = {
            'ko': '한국어',
            'en': 'English',
            'ja': '日本語',
            'zh': '中文',
            'es': 'Español'
        };

        const streamerLangName = languageNames[streamerLanguage] || streamerLanguage;
        const messageLangName = languageNames[messageLanguage] || messageLanguage;

        if (streamerLanguage === 'ko') {
            return `
시청자가 ${messageLangName}로 다음과 같이 말했습니다:
"${message}"

한국어 스트리머가 이 시청자에게 답변할 수 있도록 도와주세요.

다음 형식으로 답변해주세요:
1. 원본의미: (시청자 메시지의 한국어 의미)
2. 답변: (${messageLangName}로 적절한 답변)
3. 답변의미: (답변의 한국어 의미)
4. 발음: (답변을 한글로 발음 표기)
5. 재질문: (대화를 이어갈 수 있는 ${messageLangName} 질문 1개, 짧게)
6. 재질문발음: (재질문을 한글로 발음 표기)
7. 재질문의미: (재질문의 한국어 의미)

예시:
원본의미: 안녕하세요
답변: Nice to meet you
답변의미: 만나서 반가워요
발음: 나이스 투 밋 유
재질문: How are you?
재질문발음: 하우 아 유
재질문의미: 요즘 어때요?
`;
        } else if (streamerLanguage === 'en') {
            return `
A viewer said in ${messageLangName}:
"${message}"

Help an English-speaking streamer respond to this viewer.

Please provide:
1. Original Meaning: (English translation of viewer's message)
2. Response: (Appropriate response in ${messageLangName})
3. Response Meaning: (English translation of the response)
4. Pronunciation: (Romanized pronunciation of the response)
5. Follow-up: (A short follow-up question in ${messageLangName} to continue the conversation)
6. Follow-up Pronunciation: (Romanized pronunciation of the follow-up)
7. Follow-up Meaning: (English translation of the follow-up)

Example:
Original Meaning: Hello
Response: 안녕하세요
Response Meaning: Nice to meet you
Pronunciation: An-nyeong-ha-se-yo
Follow-up: 요즘 어때요?
Follow-up Pronunciation: Yo-jeum eo-ttae-yo
Follow-up Meaning: How are you lately?
`;
        } else {
            return `
A viewer said in ${messageLangName}:
"${message}"

Help a ${streamerLangName}-speaking streamer respond.

Provide:
1. Meaning in ${streamerLangName}
2. Response in ${messageLangName}
3. Pronunciation guide in ${streamerLangName}
`;
        }
    }

    /**
     * AI 응답 파싱
     */
    parseResponse(aiResponse, originalMessage, messageLanguage) {
        const lines = aiResponse.split('\n').filter(line => line.trim());
        
        let originalMeaning = '';
        let response = '';
        let responseMeaning = '';
        let pronunciation = '';

        let followUpQuestion = '';
        let followUpPronunciation = '';
        let followUpMeaning = '';

        for (const line of lines) {
            if (line.includes('원본의미:') || line.includes('Original Meaning:')) {
                originalMeaning = line.split(':')[1]?.trim() || '';
            } else if (line.includes('의미:') && !line.includes('원본의미:') && !line.includes('답변의미:') && !line.includes('재질문의미:') && !line.includes('Follow-up Meaning:')) {
                originalMeaning = line.split(':')[1]?.trim() || '';
            } else if (line.includes('Meaning:') && !line.includes('Original Meaning:') && !line.includes('Response Meaning:') && !line.includes('Follow-up Meaning:')) {
                originalMeaning = line.split(':')[1]?.trim() || '';
            } else if ((line.includes('답변:') || line.includes('Response:')) && !line.includes('Response Meaning:') && !line.includes('답변의미:')) {
                response = line.split(':').slice(1).join(':').trim() || '';
            } else if (line.includes('답변의미:') || line.includes('Response Meaning:')) {
                responseMeaning = line.split(':').slice(1).join(':').trim() || '';
            } else if ((line.includes('발음:') || line.includes('Pronunciation:')) && !line.includes('재질문발음:') && !line.includes('Follow-up Pronunciation:')) {
                pronunciation = line.split(':').slice(1).join(':').trim() || '';
            } else if (line.includes('재질문:') || line.includes('Follow-up:')) {
                followUpQuestion = line.split(':').slice(1).join(':').trim() || '';
            } else if (line.includes('재질문발음:') || line.includes('Follow-up Pronunciation:')) {
                followUpPronunciation = line.split(':').slice(1).join(':').trim() || '';
            } else if (line.includes('재질문의미:') || line.includes('Follow-up Meaning:')) {
                followUpMeaning = line.split(':').slice(1).join(':').trim() || '';
            }
        }

        return {
            original: originalMessage,
            originalLanguage: messageLanguage,
            originalMeaning: originalMeaning,
            meaning: originalMeaning,
            response: response,
            responseMeaning: responseMeaning,
            pronunciation: pronunciation,
            followUpQuestion: followUpQuestion,
            followUpPronunciation: followUpPronunciation,
            followUpMeaning: followUpMeaning,
            timestamp: Date.now()
        };
    }

    /**
     * 빠른 응답 생성 (자주 사용되는 인사말)
     */
    getQuickResponse(message, messageLanguage, streamerLanguage) {
        const quickResponses = {
            'en': {
                'hi': { response: 'Nice to meet you', pronunciation: '나이스 투 밋 유' },
                'hello': { response: 'Hello! Welcome!', pronunciation: '헬로우 웰컴' },
                'thanks': { response: 'You\'re welcome', pronunciation: '유어 웰컴' },
                'bye': { response: 'See you later', pronunciation: '씨 유 레이터' }
            },
            'ja': {
                'こんにちは': { response: 'はじめまして', pronunciation: '하지메마시테' },
                'ありがとう': { response: 'どういたしまして', pronunciation: '도-이타시마시테' }
            },
            'zh': {
                '你好': { response: '很高兴见到你', pronunciation: '헌 가오싱 지엔 따오 니' },
                '谢谢': { response: '不客气', pronunciation: '부 커치' }
            }
        };

        const messageLower = message.toLowerCase().trim();
        const responses = quickResponses[messageLanguage];

        if (responses && responses[messageLower]) {
            const originalMeaning = this.getMeaning(messageLower, messageLanguage, streamerLanguage);
            const responseMeaning = this.getResponseMeaning(responses[messageLower].response, messageLanguage, streamerLanguage);
            return {
                original: message,
                originalLanguage: messageLanguage,
                originalMeaning: originalMeaning,
                meaning: originalMeaning,
                response: responses[messageLower].response,
                responseMeaning: responseMeaning,
                pronunciation: responses[messageLower].pronunciation,
                timestamp: Date.now(),
                isQuickResponse: true
            };
        }

        return null;
    }

    /**
     * 의미 가져오기 (간단한 번역)
     */
    getMeaning(message, fromLang, toLang) {
        const translations = {
            'en': {
                'hi': '안녕',
                'hello': '안녕하세요',
                'thanks': '감사합니다',
                'bye': '안녕히 가세요'
            },
            'ja': {
                'こんにちは': '안녕하세요',
                'ありがとう': '감사합니다'
            },
            'zh': {
                '你好': '안녕하세요',
                '谢谢': '감사합니다'
            }
        };

        return translations[fromLang]?.[message] || message;
    }

    /**
     * 답변의 의미 가져오기
     */
    getResponseMeaning(response, responseLang, streamerLang) {
        const responseMeanings = {
            'en': {
                'Nice to meet you': '만나서 반가워요',
                'Hello! Welcome!': '안녕하세요! 환영합니다!',
                'You\'re welcome': '천만에요',
                'See you later': '나중에 봐요'
            },
            'ja': {
                'はじめまして': '처음 뵙겠습니다',
                'どういたしまして': '천만에요'
            },
            'zh': {
                '很高兴见到你': '만나서 반가워요',
                '不客气': '천만에요'
            }
        };

        return responseMeanings[responseLang]?.[response] || response;
    }
}

module.exports = PronunciationCoachService;
