const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const AdminLog = require('../models/AdminLog');

// Admin Login
router.post('/login', async (req, res) => {
    try {
        console.log('🔐 Admin login attempt:', req.body.email);
        const { email, password, remember } = req.body;
        
        if (!email || !password) {
            console.log('❌ Missing email or password');
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        // Find admin with password field
        console.log('🔍 Searching for admin:', email.toLowerCase());
        const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');
        
        if (!admin) {
            console.log('❌ Admin not found');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        console.log('✅ Admin found:', admin.email);
        
        // Check if account is locked
        if (admin.isLocked) {
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.'
            });
        }
        
        // Check if account is active
        if (!admin.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated. Please contact the system administrator.'
            });
        }
        
        // Verify password
        console.log('🔑 Verifying password...');
        const isMatch = await admin.comparePassword(password);
        console.log('🔑 Password match:', isMatch);
        
        if (!isMatch) {
            console.log('❌ Password mismatch');
            // Increment login attempts
            await admin.incLoginAttempts();
            
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        console.log('✅ Password verified successfully');
        
        // Reset login attempts on successful login
        await admin.resetLoginAttempts();
        await admin.updateLastLogin();
        
        // Create session
        req.session.adminId = admin._id;
        req.session.adminRole = admin.role;
        req.session.adminEmail = admin.email;
        
        // Set cookie expiration
        if (remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        } else {
            req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
        }
        
        // Save session before sending response
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
            }
        });
        
        // Log the login (async, don't wait)
        AdminLog.create({
            adminId: admin._id,
            action: 'admin_login',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        }).catch(err => console.error('Failed to log admin login:', err));
        
        res.json({
            success: true,
            message: 'Login successful',
            admin: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during login'
        });
    }
});

// Admin Logout
router.post('/logout', (req, res) => {
    if (req.session.adminId) {
        // Log the logout
        AdminLog.create({
            adminId: req.session.adminId,
            action: 'admin_logout',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        }).catch(err => console.error('Failed to log logout:', err));
        
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to logout'
                });
            }
            
            res.clearCookie('connect.sid');
            res.json({
                success: true,
                message: 'Logout successful'
            });
        });
    } else {
        res.json({
            success: true,
            message: 'Already logged out'
        });
    }
});

// Check Admin Session
router.get('/check', (req, res) => {
    if (req.session.adminId) {
        res.json({
            success: true,
            admin: {
                id: req.session.adminId,
                email: req.session.adminEmail,
                role: req.session.adminRole
            }
        });
    } else {
        res.json({
            success: false,
            message: 'Not authenticated'
        });
    }
});

module.exports = router;
