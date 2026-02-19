const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URL || process.env.DATABASE_URL || process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI);

const PopularSong = require('../models/PopularSong');

async function checkProgress() {
    try {
        const count = await PopularSong.countDocuments();
        console.log(`\n현재 DB에 저장된 곡: ${count}곡\n`);
        process.exit(0);
    } catch (error) {
        console.error('오류:', error);
        process.exit(1);
    }
}

checkProgress();
