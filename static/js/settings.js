const API_URL = "http://localhost:8000";
let currentUser = null;

async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }

        currentUser = await response.json();
        loadSettings();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
    }
}

async function loadSettings() {
    document.getElementById('displayName').value = currentUser.name;
    document.getElementById('emailAddress').value = currentUser.email;
    await loadSessions();
}

async function loadSessions() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/sessions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const sessions = await response.json();
            displaySessions(sessions);
        }
    } catch (error) {
        console.error('Failed to load sessions:', error);
        document.getElementById('sessionsList').innerHTML = '<p style="color: var(--text-muted);">Failed to load sessions</p>';
    }
}

function displaySessions(sessions) {
    const container = document.getElementById('sessionsList');
    
    if (sessions.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No active sessions found</p>';
        return;
    }
    
    container.innerHTML = '';
    
    sessions.forEach(session => {
        const sessionCard = document.createElement('div');
        sessionCard.className = 'session-card';
        
        const deviceType = session.user_agent && session.user_agent.includes('Mobile') ? 'mobile' : 'desktop';
        const browserInfo = getBrowserInfo(session.user_agent);
        
        sessionCard.innerHTML = `
            <div class="session-info">
                <div class="session-icon">
                    <i class="fas fa-${deviceType === 'mobile' ? 'mobile-alt' : 'desktop'}"></i>
                </div>
                <div class="session-details">
                    <h4>${browserInfo}</h4>
                    <p>IP: ${session.ip_address || 'Unknown'} • Last active: ${new Date(session.last_active).toLocaleString()}</p>
                </div>
            </div>
            <div class="session-status">
                <span class="status-badge ${session.is_active ? 'active' : 'inactive'}">
                    ${session.is_active ? 'Active' : 'Inactive'}
                </span>
                <button class="btn-outline" onclick="confirmTerminateSession('${session.session_token}')">
                    <i class="fas fa-times"></i> Terminate
                </button>
            </div>
        `;
        
        container.appendChild(sessionCard);
    });
}

function getBrowserInfo(userAgent) {
    if (!userAgent) return 'Unknown Browser';
    
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';
    if (userAgent.includes('Mobile')) return 'Mobile Browser';
    
    return 'Desktop Browser';
}

function confirmTerminateSession(sessionToken) {
    const currentToken = localStorage.getItem('token');
    if (currentToken) {
        try {
            const payload = JSON.parse(atob(currentToken.split('.')[1]));
            showConfirmModal(
                'Terminate Session',
                'Are you sure you want to terminate this session? You will be logged out from that device.',
                () => terminateSession(sessionToken)
            );
        } catch (e) {
            showConfirmModal(
                'Terminate Session',
                'Are you sure you want to terminate this session?',
                () => terminateSession(sessionToken)
            );
        }
    }
}

function showConfirmModal(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmButton').onclick = () => {
        closeConfirmModal();
        onConfirm();
    };
    document.getElementById('confirmModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function updateProfile() {
    const token = localStorage.getItem('token');
    const name = document.getElementById('displayName').value;
    const email = document.getElementById('emailAddress').value;
    
    try {
        const response = await fetch(`${API_URL}/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email })
        });
        
        if (response.ok) {
            showNotification('Profile updated successfully!', 'success');
            currentUser.name = name;
            currentUser.email = email;
        } else {
            showNotification('Failed to update profile', 'error');
        }
    } catch (error) {
        console.error('Profile update error:', error);
        showNotification('Failed to update profile', 'error');
    }
}

async function changePassword() {
    const token = localStorage.getItem('token');
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        showNotification('New passwords do not match!', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/change-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        if (response.ok) {
            showNotification('Password changed successfully!', 'success');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            const error = await response.json();
            showNotification(error.detail || 'Failed to change password', 'error');
        }
    } catch (error) {
        console.error('Password change error:', error);
        showNotification('Failed to change password', 'error');
    }
}

async function terminateSession(sessionToken) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/sessions/${sessionToken}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showNotification('Session terminated successfully!', 'success');
            loadSessions();
        } else {
            showNotification('Failed to terminate session', 'error');
        }
    } catch (error) {
        console.error('Session termination error:', error);
        showNotification('Failed to terminate session', 'error');
    }
}

function deleteAccount() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        if (confirm('This will permanently delete all your files and data. Are you absolutely sure?')) {
            showNotification('Account deletion feature will be implemented soon.', 'warning');
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : type === 'warning' ? 'var(--warning)' : 'var(--accent-primary)'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: var(--shadow);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});