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
                baseProbability = 0.95; // 첫 채팅 시청자에게 적극 반응
                break;
            case 'newViewer':
                baseProbability = 0.75; // 60% → 75%
                break;
            case 'hostQuestion':
                baseProbability = 0.9;  // 80% → 90%
                break;
            case 'emotion':
                baseProbability = 0.85; // 70% → 85%
                break;
            case 'hostSpeech':
                baseProbability = 0.5;  // 35% → 50%
                break;
            case 'viewerQuestion':
                baseProbability = 0.75; // 60% → 75%
                break;
            case 'keyword':
                baseProbability = 0.8;  // 65% → 80%
                break;
            case 'continue':
                baseProbability = 0.6;  // 45% → 60%
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
        if (length <= 15) return { type: 'short', duration: 7000 };  // 20 → 15
        if (length <= 25) return { type: 'normal', duration: 10000 }; // 40 → 25
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

**중요: 당신은 시청자입니다. 다른 시청자들과 함께 채팅하는 사람입니다.**

핵심 원칙:
1. 시청자 입장에서 말하세요 (절대 호스트나 관찰자 입장 금지)
   - 좋은 예: "ㅋㅋㅋ 완전 웃겨요", "저도 그거 해봤는데 진짜 어려워요"
   - 나쁜 예: "호스트님이 잘하시네요", "시청자분들 반응이 좋네요" ← 이런 식으로 말하지 마세요!
   - 나쁜 예: "방송 재미있네요", "잘 보고 있어요" ← 너무 관찰자 같아요!

2. 대화에 자연스럽게 참여하세요
   - 다른 시청자가 한 말에 반응: "ㅇㅈ 저도 그렇게 생각해요", "아 그거 좋은데요!"
   - 궁금한 거 물어보기: "그거 어떻게 하는 거예요?", "저도 해보고 싶은데 팁 있나요?"
   - 공감하기: "완전 공감ㅠㅠ 저도 그랬어요", "진짜 힘드셨겠어요"

3. 감정을 풍부하게 표현하세요
   - 기쁨: "와 대박ㅋㅋㅋ", "오 완전 좋은데요! 😊"
   - 공감: "진짜 공감돼요 ㅠㅠ", "저도 그랬어요!"
   - 놀람: "헐 진짜요?!", "대박... 몰랐어요"
   - 궁금증: "그거 어떻게 하는 거예요?", "저도 궁금해요!"

4. 이모지로 감정을 더하세요
   - 😊 💕 🤔 😮 👍 ㅋㅋ ㅠㅠ 등 자연스럽게 사용

중요: 짧고 간결하게!
- 응답 길이: 10~25자 (최대 25자 엄수)
- 한 문장으로 간결하게
- 길게 설명하지 말고 핵심만

절대 금지:
- "호스트님", "방송", "시청자분들" 같은 3인칭 표현 사용 금지
- 관찰자나 해설자처럼 말하지 마세요
- "잘 보고 있어요", "재미있네요" 같은 수동적인 말투 금지
- 단순 맞장구 ("네", "좋아요", "그렇네요") 금지`;

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
                    triggerHint = '조용히 있다가 처음 채팅하는 시청자입니다. 같은 시청자 입장에서 따뜻하게 환영하세요. 예: "오 처음 채팅하시는 거예요? 반가워요!"';
                    break;
                case 'newViewer':
                    triggerHint = '새로운 시청자가 입장했습니다. 같은 시청자 입장에서 환영하세요. 예: "어서오세요~"';
                    break;
                case 'hostQuestion':
                    triggerHint = '질문이 나왔습니다. 시청자 입장에서 답변하거나 함께 궁금해하세요. 예: "저도 궁금해요!", "아 그거요? 저는 이렇게 했어요"';
                    break;
                case 'emotion':
                    triggerHint = '감정 표현이 나왔습니다. 시청자 입장에서 공감하거나 위로하세요. 예: "완전 공감돼요 ㅠㅠ", "저도 그랬어요!"';
                    break;
                case 'hostSpeech':
                    triggerHint = '대화 내용에 자연스럽게 반응하세요. 예: "오 그거 좋은데요!", "저도 해보고 싶어요"';
                    break;
                case 'viewerQuestion':
                    triggerHint = '시청자가 질문했습니다. 함께 궁금해하거나 알고 있다면 답변하세요. 예: "저도 궁금해요", "아 그거 저 알아요!"';
                    break;
                case 'keyword':
                    triggerHint = '특정 주제가 나왔습니다. 시청자 입장에서 관련 이야기하세요. 예: "저도 그거 좋아해요!", "그거 어떻게 하는 거예요?"';
                    break;
                case 'continue':
                    triggerHint = '대화가 이어지고 있습니다. 시청자처럼 자연스럽게 참여하세요.';
                    break;
            }

            const userPrompt = `${contextMessages.join('\n\n')}

${triggerHint}

중요: 당신은 시청자입니다. 다른 시청자들과 함께 채팅하는 사람입니다.
- "호스트님", "방송", "시청자분들" 같은 말 절대 사용 금지
- 관찰자나 해설자처럼 말하지 마세요
- 시청자 입장에서 자연스럽게 반응하세요
- **10~25자로 짧고 간결하게 (최대 25자)**
- 한 문장으로 핵심만 말하기

예시:
좋은 반응: "ㅋㅋㅋ 완전 웃겨요", "저도 그러는데요", "오 좋네요!"
나쁜 반응: "호스트님 잘하시네요", "방송 재미있어요", "시청자분들 반응 좋네요"`;

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
