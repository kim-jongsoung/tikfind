// Admin Authentication Middleware

const isAuthenticated = (req, res, next) => {
    // Check if admin session exists
    if (req.session && req.session.adminId) {
        return next();
    }
    
    // Check if it's an API call
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication required' 
        });
    }
    
    // Redirect to admin login for web pages
    return res.redirect('/admin/login');
};

const isAdmin = (req, res, next) => {
    // Check admin session
    if (!req.session || !req.session.adminId) {
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required' 
            });
        }
        return res.redirect('/admin/login');
    }
    
    next();
};

const isSuperAdmin = (req, res, next) => {
    if (!req.session || !req.session.adminId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication required' 
        });
    }
    
    if (req.session.adminRole !== 'superadmin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Super admin access required' 
        });
    }
    
    next();
};

// Log admin actions
const logAdminAction = (action) => {
    return async (req, res, next) => {
        // Store original send function
        const originalSend = res.send;
        
        // Override send function to log after response
        res.send = function(data) {
            // Log admin action
            if (req.session && req.session.adminId) {
                const AdminLog = require('../models/AdminLog');
                AdminLog.create({
                    adminId: req.session.adminId,
                    action: action,
                    method: req.method,
                    path: req.path,
                    body: req.body,
                    query: req.query,
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.headers['user-agent']
                }).catch(err => console.error('Failed to log admin action:', err));
            }
            
            // Call original send
            originalSend.call(this, data);
        };
        
        next();
    };
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    logAdminAction
};
