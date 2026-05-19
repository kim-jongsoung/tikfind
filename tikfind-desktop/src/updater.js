/**
 * TikFind 자동 업데이트 모듈
 * GitHub Releases 기반 자동 업데이트
 */

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// 업데이트 상태
let updateDownloaded = false;
let updateInfo = null;
let onUpdateReady = null; // 콜백 함수

// 로그 설정
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// 자동 다운로드 활성화
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

/**
 * 업데이트 초기화 및 이벤트 설정
 * @param {Function} callback - 업데이트 준비 완료 시 호출될 콜백
 */
function initUpdater(callback) {
    onUpdateReady = callback;

    // 업데이트 확인 중
    autoUpdater.on('checking-for-update', () => {
        log.info('🔍 TikFind 업데이트 확인 중...');
    });

    // 업데이트 가능
    autoUpdater.on('update-available', (info) => {
        log.info(`✅ TikFind 새 버전 발견: v${info.version}`);
        updateInfo = info;
    });

    // 업데이트 없음
    autoUpdater.on('update-not-available', (info) => {
        log.info('✅ TikFind 최신 버전입니다.');
    });

    // 다운로드 진행률
    autoUpdater.on('download-progress', (progress) => {
        const percent = Math.round(progress.percent);
        log.info(`📥 TikFind 다운로드 중... ${percent}%`);
    });

    // 다운로드 완료
    autoUpdater.on('update-downloaded', (info) => {
        log.info(`✅ TikFind v${info.version} 다운로드 완료 - 재시작 시 설치됩니다.`);
        updateDownloaded = true;
        updateInfo = info;
        
        // 콜백 호출 (트레이 메뉴 업데이트용)
        if (onUpdateReady) {
            onUpdateReady(info);
        }
    });

    // 오류 처리 (앱 중단 방지)
    autoUpdater.on('error', (error) => {
        log.error('❌ TikFind 업데이트 오류:', error.message);
        // 오류가 발생해도 앱은 계속 실행
    });
}

/**
 * 업데이트 확인 시작
 */
function checkForUpdates() {
    try {
        log.info('🚀 TikFind 업데이트 확인 시작...');
        autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
        log.error('❌ 업데이트 확인 실패:', error.message);
    }
}

/**
 * 업데이트 설치 및 재시작
 */
function installUpdate() {
    if (updateDownloaded) {
        log.info('🔄 TikFind 업데이트 설치 및 재시작...');
        autoUpdater.quitAndInstall(false, true);
    }
}

/**
 * 업데이트 다운로드 완료 여부
 */
function isUpdateReady() {
    return updateDownloaded;
}

/**
 * 업데이트 정보 반환
 */
function getUpdateInfo() {
    return updateInfo;
}

module.exports = {
    initUpdater,
    checkForUpdates,
    installUpdate,
    isUpdateReady,
    getUpdateInfo
};
