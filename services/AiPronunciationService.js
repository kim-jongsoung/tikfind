const axios = require('axios');

class AiPronunciationService {
    constructor() {
        this.openaiApiKey = process.env.OPENAI_API_KEY;
    }

    /**
     * AI 발음 코치 - 스트리머 페르소나를 반영한 답변 생성
     * @param {string} message - 시청자 메시지
     * @param {string} targetLanguage - 스트리머 언어 (ko, en, ja 등)
     * @param {string} streamerNickname - 스트리머 닉네임
     * @param {string} streamerPersona - 스트리머 페르소나
     * @param {string} viewerUsername - 시청자 이름
     */
    async generatePronunciationCoach(message, targetLanguage, streamerNickname, streamerPersona, viewerUsername) {
        try {
            if (!this.openaiApiKey) {
                console.error('❌ OpenAI API 키가 설정되지 않았습니다.');
                return null;
            }

            // 언어별 프롬프트 설정
            const languageNames = {
                ko: '한국어',
                en: '영어',
                ja: '일본어',
                zh: '중국어',
                th: '태국어',
                vi: '베트남어',
                es: '스페인어'
            };

            const targetLangName = languageNames[targetLanguage] || '한국어';

            const systemPrompt = `당신은 ${streamerNickname} 스트리머의 AI 발음 코치입니다.
스트리머 페르소나: ${streamerPersona}
스트리머 언어: ${targetLangName}

역할:
1. 시청자가 보낸 외국어 메시지를 ${targetLangName}로 번역하여 의미를 설명합니다.
2. 스트리머가 시청자의 언어로 답변할 수 있도록 **시청자와 같은 언어**로 답변을 생성합니다.
3. 답변은 스트리머의 페르소나를 반영하고, 대화를 이어갈 수 있도록 질문이나 흥미로운 주제를 포함해야 합니다.
4. 답변의 발음을 ${targetLangName} 화자가 읽을 수 있도록 표기합니다.
5. responseMeaning은 답변의 ${targetLangName} 의미를 간단히 설명합니다.

출력 형식 (JSON):
{
  "originalMeaning": "원본 메시지의 ${targetLangName} 의미",
  "nicknamePronunciation": "시청자 닉네임을 ${targetLangName} 화자가 읽을 수 있는 발음 표기 (닉네임이 외국어/특수문자면 발음 표기, 한국어면 그대로)",
  "response": "시청자와 같은 언어로 작성된 답변 (스트리머 페르소나 반영)",
  "responseMeaning": "답변의 ${targetLangName} 의미",
  "pronunciation": "답변을 ${targetLangName} 화자가 읽을 수 있는 발음 표기"
}

예시 1 (영어 시청자 @john_doe):
시청자: "Hello"
{
  "originalMeaning": "안녕하세요",
  "nicknamePronunciation": "존 도우",
  "response": "Hello! Nice to meet you~ Where are you from?",
  "responseMeaning": "친근한 인사와 출신 국가 질문",
  "pronunciation": "헬로우! 나이스 투 밋 유~ 웨어 아 유 프롬?"
}

예시 2 (일본어 시청자 @sakura_chan):
시청자: "こんにちは"
{
  "originalMeaning": "안녕하세요",
  "nicknamePronunciation": "사쿠라 찬",
  "response": "こんにちは！はじめまして～どこから来ましたか？",
  "responseMeaning": "친근한 인사와 출신 국가 질문",
  "pronunciation": "곤니치와! 하지메마시테~ 도코카라 키마시타카?"
}`;

            const userPrompt = `시청자 @${viewerUsername}가 보낸 메시지: "${message}"

스트리머 ${streamerNickname}의 페르소나(${streamerPersona})를 반영하여 **시청자와 같은 언어**로 답변을 생성해주세요.
답변은 대화를 이어갈 수 있도록 질문이나 흥미로운 주제를 포함해야 합니다.
발음은 ${targetLangName} 화자가 읽을 수 있도록 표기해주세요.`;

            console.log('🤖 AI 발음 코치 요청:', message, '->', targetLangName);

            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const aiResponse = response.data.choices[0].message.content;
            console.log('✅ AI 응답:', aiResponse);

            // JSON 파싱
            try {
                const result = JSON.parse(aiResponse);
                return {
                    originalMeaning: result.originalMeaning,
                    nicknamePronunciation: result.nicknamePronunciation || '',
                    response: result.response,
                    responseMeaning: result.responseMeaning,
                    pronunciation: result.pronunciation
                };
            } catch (parseError) {
                console.error('❌ JSON 파싱 오류:', parseError);
                // JSON 파싱 실패 시 기본 응답
                return {
                    originalMeaning: '번역 중...',
                    response: aiResponse,
                    responseMeaning: '답변',
                    pronunciation: aiResponse
                };
            }

        } catch (error) {
            console.error('❌ AI 발음 코치 오류:', error.message);
            if (error.response) {
                console.error('❌ OpenAI API 응답 에러:', error.response.status, error.response.data);
            }
            return null;
        }
    }
}

module.exports = AiPronunciationService;
