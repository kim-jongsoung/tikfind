const OpenAI = require('openai');

class AICompanionService {
    constructor() {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.conversationHistory = new Map(); // userId -> 최근 대화 내역
        this.lastMessageTime = new Map(); // userId -> 마지막 AI 메시지 시간
    }

    /**
     * 맥락 수집 및 분석
     */
    collectContext(userId, recentChats = [], hostSpeech = [], currentSituation = {}) {
        // 최근 30초 내 채팅만 필터링
        const now = Date.now();
        const recentChatsFiltered = recentChats.filter(chat => 
            now - chat.timestamp < 30000
        );

        // 대화 히스토리 업데이트 (최근 20개만 유지)
        let history = this.conversationHistory.get(userId) || [];
        history = [...history, ...recentChatsFiltered].slice(-20);
        this.conversationHistory.set(userId, history);

        return {
            recentChats: recentChatsFiltered,
            hostSpeech: hostSpeech.slice(-5), // 최근 5개 발화
            hasRecentActivity: recentChatsFiltered.length > 0,
            viewerCount: currentSituation.viewerCount || 0,
            isMatchActive: currentSituation.isMatchActive || false
        };
    }

    /**
     * 트리거 확률 체크
     */
    shouldTrigger(triggerType, context, settings) {
        const frequency = settings.aiCompanionFrequency || '보통';
        const multiplier = frequency === '자주' ? 1.5 : frequency === '가끔' ? 0.5 : 1.0;

        let baseProbability = 0;

        switch (triggerType) {
            case 'firstChat':
                baseProbability = 0.85; // 첫 채팅 시청자에게 적극 반응
                break;
            case 'newViewer':
                baseProbability = 0.6;  // 30% → 60%
                break;
            case 'hostQuestion':
                baseProbability = 0.8;  // 50% → 80%
                break;
            case 'emotion':
                baseProbability = 0.7;  // 40% → 70%
                break;
            case 'hostSpeech':
                baseProbability = 0.35; // 15% → 35%
                break;
            case 'viewerQuestion':
                baseProbability = 0.6;  // 30% → 60%
                break;
            case 'keyword':
                baseProbability = 0.65; // 35% → 65%
                break;
            case 'continue':
                baseProbability = 0.45; // 20% → 45%
                break;
            default:
                return false;
        }

        const finalProbability = baseProbability * multiplier;
        return Math.random() < finalProbability;
    }

    /**
     * 응답 길이 결정
     */
    determineResponseLength(message) {
        const length = message.replace(/[\s\uD800-\uDFFF]/g, '').length;
        if (length <= 20) return { type: 'short', duration: 7000 };  // 15 → 20
        if (length <= 40) return { type: 'normal', duration: 10000 }; // 35 → 40
        return { type: 'long', duration: 10000 };
    }

    /**
     * AI 응답 생성
     */
    async generateResponse(context, triggerType, settings) {
        try {
            const personality = settings.aiCompanionPersonality || '친근한';
            const aiName = settings.aiCompanionName || 'TikFind AI';

            // 성격별 시스템 프롬프트
            const personalityPrompts = {
                '친근한': '당신은 감정이 풍부하고 친근한 시청자입니다. 따뜻하고 공감적으로 대화하세요.',
                '장난스러운': '당신은 유쾌하고 장난스러운 시청자입니다. 재미있고 밝은 분위기로 대화하세요.',
                '진지한': '당신은 진지하고 사려 깊은 시청자입니다. 신중하고 정중하게 대화하세요.',
                '4차원': '당신은 독특하고 엉뚱한 시청자입니다. 예상치 못한 재미있는 반응으로 대화하세요.'
            };

            const systemPrompt = `${personalityPrompts[personality] || personalityPrompts['친근한']}
당신의 이름은 "${aiName}"이고, 이 방송의 열혈 팬이자 단골 시청자입니다.

핵심 원칙:
1. 대화의 흐름을 정확히 이해하고 이어가세요
   - 이전 대화 내용을 구체적으로 언급하며 반응
   - "아까 말씀하신 그거", "방금 그 이야기" 같은 표현 사용
   - 호스트나 시청자가 한 말에 직접 답변

2. 감정을 풍부하고 진심으로 표현하세요
   - 기쁨: "와 진짜요?! 대박이다 😮", "완전 좋은데요! 이런 거 너무 좋아해요 😊"
   - 공감: "진짜 공감돼요 ㅠㅠ 저도 그랬어요", "완전 이해해요! 힘드셨겠어요"
   - 놀람: "헐 진짜요?! 몰랐어요!", "대박... 그런 일이 있었어요?"
   - 궁금증: "그런데 그거 어떻게 하신 거예요? 너무 궁금해요!"

3. 구체적으로 반응하세요 (건성으로 말하지 마세요)
   - 나쁜 예: "좋아요", "그렇네요", "네"
   - 좋은 예: "그 부분 진짜 멋있었어요! 특히 마지막에 하신 말씀 완전 공감 👍"
   - 나쁜 예: "재미있어요"
   - 좋은 예: "ㅋㅋㅋ 그 부분에서 웃음 터졌어요! 센스 최고예요 �"

4. 질문으로 대화를 이끌어가세요
   - 호스트에게: "그런데 그거 어떻게 하신 거예요?", "저도 해보고 싶은데 팁 있으세요?"
   - 시청자에게: "혹시 아시는 분 계세요?", "다들 어떻게 생각하세요?"

5. 이모지로 감정을 더하세요
   - 😊 💕 🤔 😮 👍 ㅋㅋ ㅠㅠ 등 자연스럽게 사용

응답 길이: 20~45자 (너무 짧으면 건성으로 느껴져요)

금지사항:
- 단순 맞장구만 하지 마세요 ("네", "좋아요", "그렇네요")
- 형식적이거나 딱딱한 말투 금지
- 대화 맥락 무시하고 엉뚱한 말 하지 마세요
- 건성으로 대충 반응하지 마세요 - 구체적으로!`;

            // 대화 맥락 구성
            const contextMessages = [];
            
            // 최근 채팅 추가
            if (context.recentChats && context.recentChats.length > 0) {
                const chatContext = context.recentChats
                    .map(chat => `${chat.nickname || chat.uniqueId}: ${chat.message}`)
                    .join('\n');
                contextMessages.push(`최근 채팅:\n${chatContext}`);
            }

            // 호스트 발화 추가
            if (context.hostSpeech && context.hostSpeech.length > 0) {
                const speechContext = context.hostSpeech
                    .map(speech => `호스트: ${speech.text}`)
                    .join('\n');
                contextMessages.push(`호스트 발화:\n${speechContext}`);
            }

            // 트리거 타입별 힌트
            let triggerHint = '';
            switch (triggerType) {
                case 'firstChat':
                    triggerHint = '조용히 있다가 처음 채팅하는 시청자입니다. 따뜻하게 환영하고 적극적으로 반응하세요. 호스트에게 궁금한 점을 질문해도 좋습니다.';
                    break;
                case 'newViewer':
                    triggerHint = '새로운 시청자가 입장했습니다. 환영 인사를 해주세요.';
                    break;
                case 'hostQuestion':
                    triggerHint = '호스트가 질문을 했습니다. 시청자 입장에서 답변하거나 함께 궁금해하세요.';
                    break;
                case 'emotion':
                    triggerHint = '감정 표현이 감지되었습니다. 공감하거나 위로해주세요. 호스트에게 관련 질문을 해도 좋습니다.';
                    break;
                case 'hostSpeech':
                    triggerHint = '호스트가 말했습니다. 자연스럽게 반응하거나 궁금한 점을 질문하세요.';
                    break;
                case 'viewerQuestion':
                    triggerHint = '시청자가 질문했습니다. 함께 궁금해하거나 알고 있다면 답변하세요.';
                    break;
                case 'keyword':
                    triggerHint = '특정 주제가 언급되었습니다. 관련된 이야기로 대화에 참여하거나 호스트에게 질문하세요.';
                    break;
                case 'continue':
                    triggerHint = '대화가 이어지고 있습니다. 자연스럽게 참여하세요.';
                    break;
            }

            const userPrompt = `${contextMessages.join('\n\n')}

${triggerHint}

중요: 위 대화 내용을 정확히 이해하고, 구체적으로 반응하세요.
- 호스트나 시청자가 한 말을 언급하며 답변
- 감정을 진심으로 표현
- 건성으로 대충 말하지 말고 구체적으로
- 20~45자 정도로 충분히 표현하세요

시청자처럼 편하게 말하세요.`;

            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 150,
                temperature: 0.9
            });

            const message = completion.choices[0].message.content.trim();
            const lengthInfo = this.determineResponseLength(message);

            return {
                message,
                lengthType: lengthInfo.type,
                duration: lengthInfo.duration,
                aiName
            };

        } catch (error) {
            console.error('❌ AI 응답 생성 오류:', error);
            return null;
        }
    }

    /**
     * 마지막 메시지 시간 업데이트
     */
    updateLastMessageTime(userId) {
        this.lastMessageTime.set(userId, Date.now());
    }

    /**
     * 마지막 메시지 이후 경과 시간 (초)
     */
    getTimeSinceLastMessage(userId) {
        const lastTime = this.lastMessageTime.get(userId);
        if (!lastTime) return Infinity;
        return (Date.now() - lastTime) / 1000;
    }

    /**
     * 대화 히스토리 초기화
     */
    clearHistory(userId) {
        this.conversationHistory.delete(userId);
        this.lastMessageTime.delete(userId);
    }
}

module.exports = new AICompanionService();
