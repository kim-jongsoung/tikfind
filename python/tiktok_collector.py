"""
TikFind - TikTok Live Data Collector
PC에서 실행되어 TikTok Live 데이터를 수집하고 서버로 전송하는 Python 스크립트
"""

import asyncio
import aiohttp
import argparse
import sys
from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    ConnectEvent,
    DisconnectEvent,
    CommentEvent,
    UserStatsEvent,
    LikeEvent,
    GiftEvent
)

class TikTokCollector:
    def __init__(self, username, server_url, user_id):
        self.username = username
        self.server_url = server_url.rstrip('/')
        self.user_id = user_id
        self.client = TikTokLiveClient(unique_id=f"@{username}")
        self.session = None
        
        # 이벤트 핸들러 등록
        self.client.add_listener("connect", self.on_connect)
        self.client.add_listener("disconnect", self.on_disconnect)
        self.client.add_listener("comment", self.on_comment)
        self.client.add_listener("user_stats", self.on_viewer_update)
        self.client.add_listener("like", self.on_like)
        self.client.add_listener("gift", self.on_gift)

    async def send_to_server(self, endpoint, data):
        """서버로 데이터 전송"""
        try:
            if not self.session:
                self.session = aiohttp.ClientSession()
            
            url = f"{self.server_url}{endpoint}"
            async with self.session.post(url, json=data) as response:
                if response.status == 200:
                    print(f"✅ 서버 전송 성공: {endpoint}")
                else:
                    print(f"⚠️ 서버 응답 오류: {response.status}")
        except Exception as e:
            print(f"❌ 서버 전송 실패: {e}")

    async def on_connect(self, event: ConnectEvent):
        """TikTok Live 연결 성공"""
        print(f"✅ TikTok Live 연결 성공: @{self.username}")
        await self.send_to_server("/api/live/status", {
            "userId": self.user_id,
            "username": self.username,
            "isLive": True,
            "timestamp": event.timestamp if hasattr(event, 'timestamp') else None
        })

    async def on_disconnect(self, event: DisconnectEvent):
        """TikTok Live 연결 종료"""
        print(f"❌ TikTok Live 연결 종료: @{self.username}")
        await self.send_to_server("/api/live/status", {
            "userId": self.user_id,
            "username": self.username,
            "isLive": False
        })

    async def on_comment(self, event: CommentEvent):
        """채팅 메시지 수신"""
        username = event.user.nickname
        message = event.comment
        
        print(f"💬 [{username}]: {message}")
        
        await self.send_to_server("/api/live/chat", {
            "userId": self.user_id,
            "username": username,
            "message": message,
            "timestamp": event.timestamp if hasattr(event, 'timestamp') else None
        })

    async def on_viewer_update(self, event: UserStatsEvent):
        """시청자 수 업데이트"""
        viewer_count = event.viewer_count if hasattr(event, 'viewer_count') else 0
        print(f"👥 시청자 수: {viewer_count}")
        
        await self.send_to_server("/api/live/viewers", {
            "userId": self.user_id,
            "viewerCount": viewer_count
        })

    async def on_like(self, event: LikeEvent):
        """좋아요 수신"""
        print(f"❤️ 좋아요 +{event.likeCount}")

    async def on_gift(self, event: GiftEvent):
        """선물 수신"""
        gift_name = event.gift.name if hasattr(event.gift, 'name') else 'Unknown'
        print(f"🎁 선물: {gift_name}")
        
        await self.send_to_server("/api/live/gift", {
            "userId": self.user_id,
            "giftName": gift_name,
            "username": event.user.nickname if hasattr(event, 'user') else 'Unknown'
        })

    async def start(self):
        """TikTok Live 수집 시작"""
        try:
            print(f"🚀 TikFind Collector 시작...")
            print(f"📺 TikTok 계정: @{self.username}")
            print(f"🌐 서버: {self.server_url}")
            print(f"👤 사용자 ID: {self.user_id}")
            print("-" * 50)
            print(f"🔄 TikTok Live 연결 시도 중...")
            
            await self.client.start()
        except KeyboardInterrupt:
            print("\n⏹️ 사용자가 중지했습니다.")
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            print(f"📋 오류 타입: {type(e).__name__}")
            import traceback
            print(f"📋 상세 오류:\n{traceback.format_exc()}")
        finally:
            if self.session:
                await self.session.close()

def main():
    parser = argparse.ArgumentParser(description='TikFind - TikTok Live Data Collector')
    parser.add_argument('--username', required=True, help='TikTok 사용자 이름 (@ 제외)')
    parser.add_argument('--server', required=True, help='TikFind 서버 URL (예: https://tikfind.railway.app)')
    parser.add_argument('--user-id', required=True, help='TikFind 사용자 ID')
    
    args = parser.parse_args()
    
    collector = TikTokCollector(
        username=args.username,
        server_url=args.server,
        user_id=args.user_id
    )
    
    asyncio.run(collector.start())

if __name__ == "__main__":
    main()
