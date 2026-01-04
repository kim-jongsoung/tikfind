const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// 업데이트 정보 제공 (latest.yml)
router.get('/latest.yml', (req, res) => {
    try {
        const ymlPath = path.join(__dirname, '../public/updates/latest.yml');
        
        if (!fs.existsSync(ymlPath)) {
            // 기본 latest.yml 생성
            const defaultYml = `version: 1.0.0
files:
  - url: TikFind-Setup-1.0.0.exe
    sha512: placeholder
    size: 0
path: TikFind-Setup-1.0.0.exe
sha512: placeholder
releaseDate: ${new Date().toISOString()}`;
            
            fs.writeFileSync(ymlPath, defaultYml);
        }
        
        res.setHeader('Content-Type', 'text/yaml');
        res.sendFile(ymlPath);
    } catch (error) {
        console.error('latest.yml 제공 오류:', error);
        res.status(500).send('업데이트 정보를 불러올 수 없습니다.');
    }
});

// 업데이트 파일 다운로드
router.get('/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, '../public/updates', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('파일을 찾을 수 없습니다.');
        }
        
        res.download(filePath);
    } catch (error) {
        console.error('업데이트 파일 다운로드 오류:', error);
        res.status(500).send('다운로드 중 오류가 발생했습니다.');
    }
});

module.exports = router;
