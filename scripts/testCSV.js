const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'Spotify_Youtube.csv');

let count = 0;
let withYoutubeUrl = 0;

fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
        count++;
        
        if (count <= 5) {
            console.log('\n레코드', count, ':');
            console.log('  컬럼들:', Object.keys(row));
            console.log('  Url_youtube:', row.Url_youtube);
            console.log('  Track:', row.Track);
            console.log('  Artist:', row.Artist);
        }
        
        if (row.Url_youtube && row.Url_youtube.includes('youtube.com')) {
            withYoutubeUrl++;
        }
        
        if (count === 100) {
            console.log('\n\n총 100개 레코드 중:');
            console.log('  YouTube URL 있는 레코드:', withYoutubeUrl);
            process.exit(0);
        }
    })
    .on('end', () => {
        console.log('\n\n전체 레코드:', count);
        console.log('YouTube URL 있는 레코드:', withYoutubeUrl);
        process.exit(0);
    })
    .on('error', (error) => {
        console.error('에러:', error);
        process.exit(1);
    });
