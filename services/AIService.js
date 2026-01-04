const OpenAI = require('openai');

class AIService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * 채팅 메시지에 대한 AI 자동응답 생성 (외국어만 번역 + 추천 답변 + 발음 가이드)
     */
    async generateResponse(message, userLanguage = 'ko') {
        try {
            // 한국어는 응답하지 않음
            if (userLanguage === 'ko') {
                return null;
            }

            // 외국어는 번역 + 추천 답변 + 발음 가이드 제공
            const languageNames = {
                'en': '영어',
                'ja': '일본어',
                'es': '스페인어',
                'zh-TW': '중국어',
                'vi': '베트남어',
                'th': '태국어'
            };

            const langName = languageNames[userLanguage] || '외국어';
            
            const systemPrompt = `당신은 친근한 DJ 어시스턴트입니다. 다음 형식으로 응답하세요:

📝 AI 번역: "[한국어 번역]"

💬 AI 추천 답변:
"[친근한 한국어 답변]"

🗣️ 발음 가이드 (그대로 읽으세요!):
"[원문 언어의 한글 발음]"

- 번역은 정확하고 자연스럽게
- 추천 답변은 짧고 친근하게 (이모지 포함)
- 발음 가이드는 한국인이 그대로 읽을 수 있도록 한글로 표기`;
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `시청자 (${langName}): "${message}"` }
                ],
                max_tokens: 200,
                temperature: 0.7
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error('AI 응답 생성 실패:', error);
            return null;
        }
    }

    /**
     * 신청곡 파싱 (AI 사용)
     */
    async parseSongRequest(message) {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Extract song title and artist from the message. Return JSON format: {\"title\": \"song title\", \"artist\": \"artist name\"}. If no song request found, return null."
                    },
                    { role: "user", content: message }
                ],
                max_tokens: 100,
                temperature: 0.3
            });

            const result = response.choices[0].message.content;
            try {
                return JSON.parse(result);
            } catch {
                return null;
            }
        } catch (error) {
            console.error('신청곡 파싱 실패:', error);
            return null;
        }
    }

    /**
     * 언어별 시스템 프롬프트
     */
    getSystemPrompt(language) {
        const prompts = {
            ko: "당신은 친근하고 유쾌한 DJ 어시스턴트입니다. 한국어로 짧고 재미있게 응답하세요. 이모지를 적절히 사용하세요.",
            en: "You are a friendly and fun DJ assistant. Respond briefly and entertainingly in English. Use emojis appropriately.",
            ja: "あなたは親しみやすく楽しいDJアシスタントです。日本語で短く面白く応答してください。絵文字を適切に使用してください。",
            es: "Eres un asistente de DJ amigable y divertido. Responde brevemente y de manera entretenida en español. Usa emojis apropiadamente.",
            'zh-TW': "你是一個友好且有趣的DJ助手。用繁體中文簡短有趣地回應。適當使用表情符號。",
            vi: "Bạn là trợ lý DJ thân thiện và vui vẻ. Trả lời ngắn gọn và thú vị bằng tiếng Việt. Sử dụng emoji phù hợp.",
            th: "คุณเป็นผู้ช่วย DJ ที่เป็นมิตรและสนุกสนาน ตอบสั้นๆ และสนุกสนานเป็นภาษาไทย ใช้อิโมจิอย่างเหมาะสม"
        };

        return prompts[language] || prompts.ko;
    }

    /**
     * 언어 감지
     */
    async detectLanguage(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Detect the language of the text. Return only the language code: ko, en, ja, es, zh-TW, vi, or th."
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 10,
                temperature: 0
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('언어 감지 실패:', error);
            return 'ko';
        }
    }
}

module.exports = AIService;
