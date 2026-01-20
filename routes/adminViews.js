const express = require('express');
const router = express.Router();
const path = require('path');
const { isAuthenticated, isAdmin } = require('../middleware/adminAuth');

// Admin Login Page (no auth required)
router.get('/login', (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session && req.session.adminId) {
        return res.redirect('/admin/dashboard');
    }
    res.sendFile(path.join(__dirname, '../public/admin/login.html'));
});

// Apply authentication middleware to all other routes
router.use(isAuthenticated);
router.use(isAdmin);

// Admin Dashboard
router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});

// User Management
router.get('/users', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/users.html'));
});

// User Detail (will be created later)
router.get('/users/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/user-detail.html'));
});

// Subscriptions
router.get('/subscriptions', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/subscriptions.html'));
});

// Payments
router.get('/payments', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/payments.html'));
});

// Activity Logs
router.get('/logs', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/logs.html'));
});

// Plan Limits
router.get('/plan-limits', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/plan-limits.html'));
});

// Curated Songs (AI 자동재생 곡 관리)
router.get('/curated-songs', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/curated-songs.html'));
});

module.exports = router;
