// Script to create admin account
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const createAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ Connected to MongoDB');
        
        // Admin details
        const adminData = {
            email: 'kmtour@naver.com',
            password: 'TikFind@Admin2025!',  // Change this to a strong password
            name: 'Super Administrator',
            role: 'superadmin'
        };
        
        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: adminData.email });
        
        if (existingAdmin) {
            console.log('⚠️  Admin account already exists');
            console.log('Email:', existingAdmin.email);
            console.log('Name:', existingAdmin.name);
            console.log('Role:', existingAdmin.role);
            
            // Ask if user wants to update password
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            readline.question('Do you want to update the password? (yes/no): ', async (answer) => {
                if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
                    existingAdmin.password = adminData.password;
                    await existingAdmin.save();
                    console.log('✅ Password updated successfully');
                }
                readline.close();
                mongoose.connection.close();
            });
        } else {
            // Create new admin
            const admin = new Admin(adminData);
            await admin.save();
            
            console.log('✅ Admin account created successfully!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Email:', adminData.email);
            console.log('Password:', adminData.password);
            console.log('Name:', adminData.name);
            console.log('Role:', adminData.role);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('⚠️  IMPORTANT: Change the password after first login!');
            console.log('Login URL: http://localhost:3001/admin/login');
            
            mongoose.connection.close();
        }
    } catch (error) {
        console.error('❌ Error creating admin:', error);
        mongoose.connection.close();
        process.exit(1);
    }
};

createAdmin();
