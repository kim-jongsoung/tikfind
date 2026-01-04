// TikFind - 공통 레이아웃 로더
document.addEventListener('DOMContentLoaded', function() {
    loadSidebar();
    loadHeader();
    highlightCurrentPage();
    initMobileMenu();
    
    // i18n이 로드되면 언어 선택기 생성
    setTimeout(() => {
        if (window.TikFindI18n && typeof window.TikFindI18n.createLanguageSelector === 'function') {
            // 이미 i18n.js에서 자동으로 생성됨
        }
    }, 100);
});

function loadSidebar() {
    const sidebarHTML = `
        <aside id="sidebar" class="fixed left-0 top-0 h-screen w-64 bg-black text-white shadow-lg z-40 transform -translate-x-full md:translate-x-0 transition-transform duration-300">
            <div class="p-6 border-b border-gray-800 flex justify-between items-center">
                <a href="/dashboard" class="hover:opacity-80 transition">
                    <img src="/images/logo.png" alt="TikFind Logo" class="h-10">
                </a>
                <button id="close-sidebar" class="md:hidden text-white hover:text-gray-300">
                    <i class="fas fa-times text-2xl"></i>
                </button>
            </div>
            <nav class="p-4">
                <ul class="space-y-2">
                    <li>
                        <a href="/dashboard" class="nav-link flex items-center p-3 rounded-lg hover:bg-slate-800 transition" data-page="dashboard">
                            <i class="fas fa-home mr-3"></i>
                            <span data-i18n="dashboard">Dashboard</span>
                        </a>
                    </li>
                    <li>
                        <a href="/dashboard/overlay" class="nav-link flex items-center p-3 rounded-lg hover:bg-slate-800 transition" data-page="overlay">
                            <i class="fas fa-layer-group mr-3"></i>
                            <span data-i18n="overlay">오버레이</span>
                        </a>
                    </li>
                    <li>
                        <a href="/dashboard/billing" class="nav-link flex items-center p-3 rounded-lg hover:bg-slate-800 transition" data-page="billing">
                            <i class="fas fa-credit-card mr-3"></i>
                            <span data-i18n="billing">구독 관리</span>
                        </a>
                    </li>
                    <li>
                        <a href="/dashboard/history" class="nav-link flex items-center p-3 rounded-lg hover:bg-slate-800 transition" data-page="history">
                            <i class="fas fa-history mr-3"></i>
                            <span data-i18n="history">히스토리</span>
                        </a>
                    </li>
                    <li>
                        <a href="/dashboard/settings" class="nav-link flex items-center p-3 rounded-lg hover:bg-slate-800 transition" data-page="settings">
                            <i class="fas fa-cog mr-3"></i>
                            <span data-i18n="settings">설정</span>
                        </a>
                    </li>
                </ul>
            </nav>
        </aside>
    `;
    
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = sidebarHTML;
        
        // 사이드바 로드 후 번역 적용
        if (window.TikFindI18n && typeof window.TikFindI18n.applyTranslations === 'function') {
            window.TikFindI18n.applyTranslations();
        }
    }
}

function loadHeader() {
    const headerHTML = `
        <header class="fixed top-0 left-0 md:left-64 right-0 bg-slate-800 text-white shadow-lg z-30 flex items-center justify-between px-4 md:px-6" style="height: 88px;">
            <div class="flex items-center space-x-4">
                <button id="mobile-menu-btn" class="md:hidden text-white hover:text-gray-300">
                    <i class="fas fa-bars text-2xl"></i>
                </button>
                <h1 class="text-lg md:text-xl font-semibold" id="page-title">Dashboard</h1>
            </div>
            <div class="flex items-center space-x-2 md:space-x-4">
                <div id="header-language-selector" class="hidden md:block"></div>
                <div class="flex items-center space-x-2 md:space-x-3">
                    <div id="user-plan-badge" class="flex items-center space-x-2">
                        <div id="plan-icon" class="w-3 h-3 rounded-full"></div>
                        <span id="plan-name" class="text-xs font-semibold hidden md:inline"></span>
                    </div>
                    <img src="https://placehold.co/40x40?text=User" alt="Profile" class="w-8 h-8 md:w-10 md:h-10 rounded-full">
                    <span class="text-xs md:text-sm hidden sm:inline" id="user-name" data-i18n="welcomeMessage">사용자</span>
                </div>
                <a href="/auth/logout" class="px-3 py-2 md:px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">
                    <i class="fas fa-sign-out-alt md:mr-2"></i><span class="hidden md:inline" data-i18n="logout">로그아웃</span>
                </a>
            </div>
        </header>
        <div id="mobile-overlay" class="fixed inset-0 bg-black bg-opacity-50 z-30 hidden"></div>
    `;
    
    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
        headerContainer.innerHTML = headerHTML;
        
        // 헤더 로드 후 번역 적용
        if (window.TikFindI18n && typeof window.TikFindI18n.applyTranslations === 'function') {
            window.TikFindI18n.applyTranslations();
        }
    }
    
    loadUserInfo();
}

function highlightCurrentPage() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (currentPath === href || (currentPath === '/dashboard' && href === '/dashboard')) {
            link.classList.add('bg-indigo-600');
            link.classList.remove('hover:bg-slate-800');
        }
    });
}

async function loadUserInfo() {
    try {
        const response = await fetch('/api/current_user');
        const data = await response.json();
        
        if (data.success && data.user) {
            const userName = document.getElementById('user-name');
            if (userName) {
                userName.textContent = data.user.nickname || data.user.email;
            }
        }
        
        // 플랜 정보 가져오기
        const planResponse = await fetch('/api/user/plan');
        const planData = await planResponse.json();
        
        if (planData.success) {
            updatePlanBadge(planData.plan, planData.subscriptionStatus);
        }
    } catch (error) {
        console.error('사용자 정보 로드 실패:', error);
    }
}

function updatePlanBadge(plan, subscriptionStatus) {
    const planIcon = document.getElementById('plan-icon');
    const planName = document.getElementById('plan-name');
    
    if (!planIcon || !planName) return;
    
    // plan이 'free'이면 무료 플랜
    // plan이 'pro'이고 subscriptionStatus가 'active' 또는 'trial'이면 UNIVERSE 플랜
    // 나중에 UNLIMITED 플랜 추가 시 plan이 'unlimited'로 구분
    
    if (plan === 'free' || !subscriptionStatus || subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled') {
        // Free 플랜 - 회색
        planIcon.style.backgroundColor = '#9ca3af';
        planName.textContent = 'FREE';
        planName.style.color = '#9ca3af';
    } else if (plan === 'unlimited') {
        // UNLIMITED 플랜 - 금색
        planIcon.style.backgroundColor = '#fbbf24';
        planName.textContent = 'UNLIMITED';
        planName.style.color = '#fbbf24';
    } else if (plan === 'pro' && (subscriptionStatus === 'active' || subscriptionStatus === 'trial')) {
        // UNIVERSE 플랜 - 보라색
        planIcon.style.backgroundColor = '#8b5cf6';
        planName.textContent = 'UNIVERSE';
        planName.style.color = '#8b5cf6';
    } else {
        // 기본값 - Free
        planIcon.style.backgroundColor = '#9ca3af';
        planName.textContent = 'FREE';
        planName.style.color = '#9ca3af';
    }
}

function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        });
    }
    
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        });
    }
}
