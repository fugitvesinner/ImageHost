const API_URL = "http://localhost:8000";
const MAX_STORAGE_MB = 1000;

async function checkAuth() {
    const token = localStorage.getItem('token');
    console.log("Token in localStorage:", localStorage.getItem('token'));
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

        loadStorageInfo();
        loadDashboardData();   
        setupUpload();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
    }
}


async function loadDashboardData() {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/files`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            userFiles = await response.json();
            updateStats(userFiles);
        }
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        useMockData();
    }
}

function updateStats(files) {
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayFiles = files.filter(file => {
        const uploadDate = new Date(file.upload_date);
        uploadDate.setHours(0, 0, 0, 0);
        return uploadDate.getTime() === today.getTime();
    }).length;

    const usedMB = (totalSize / (1024 * 1024)).toFixed(2);
    const freeMB = (1000 - usedMB).toFixed(2);

    document.getElementById('totalUploads').textContent = totalFiles;
    document.getElementById('uploadsToday').textContent = todayFiles;
    document.getElementById('usedSpace').textContent = `${usedMB}MB`;
    document.getElementById('freeSpace').textContent = `${freeMB}MB`;
}


async function loadStorageInfo() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/files`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const files = await response.json();
            const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);
            const usedMB = (totalSize / (1024 * 1024)).toFixed(2);
            const usedPercentage = (usedMB / MAX_STORAGE_MB) * 100;
            
            document.getElementById('usedStorage').textContent = `${usedMB}MB`;
            document.getElementById('storageBar').style.width = `${usedPercentage}%`;
        } else {
            document.getElementById('usedStorage').textContent = `0MB`;
            document.getElementById('storageBar').style.width = `0%`;
        }
    } catch (error) {
        console.error('Failed to load storage info:', error);
        document.getElementById('usedStorage').textContent = `0MB`;
        document.getElementById('storageBar').style.width = `0%`;
    }
}


function setupUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
}

async function handleFiles(files) {
    const token = localStorage.getItem('token');
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml'];
    const maxSize = 10 * 1024 * 1024;

    const currentUsage = await getCurrentStorageUsage();
    const totalNewSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);
    const newUsageMB = (currentUsage + totalNewSize) / (1024 * 1024);

    if (newUsageMB > MAX_STORAGE_MB) {
        showNotification(`Upload would exceed storage limit of ${MAX_STORAGE_MB}MB. Current usage: ${(currentUsage / (1024 * 1024)).toFixed(2)}MB`, 'error');
        return;
    }

    const queueContainer = document.getElementById('uploadQueue');
    const queueItems = document.getElementById('queueItems');

    queueContainer.style.display = 'block';
    queueItems.innerHTML = '';

    for (let file of files) {
        if (!allowedTypes.includes(file.type)) {
            showNotification(`${file.name}: Unsupported file type`, 'error');
            continue;
        }

        if (file.size > maxSize) {
            showNotification(`${file.name}: File too large (max 10MB)`, 'error');
            continue;
        }

        const queueItem = createQueueItem(file);
        queueItems.appendChild(queueItem);

        await uploadFile(file, token, queueItem);
    }
}

async function getCurrentStorageUsage() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/files`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const files = await response.json();
            return files.reduce((sum, file) => sum + file.file_size, 0);
        }
    } catch (error) {
        console.error('Failed to get storage usage:', error);
    }
    
    return 0;
}

function createQueueItem(file) {
    const item = document.createElement('div');
    item.className = 'queue-item';
    
    item.innerHTML = `
        <div class="queue-file-icon">
            <i class="fas fa-image"></i>
        </div>
        <div class="queue-file-details">
            <div class="queue-file-name">${file.name}</div>
            <div class="queue-file-size">${formatFileSize(file.size)}</div>
        </div>
        <div class="queue-progress">
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <div class="queue-status">Waiting...</div>
        </div>
    `;
    
    return item;
}

async function uploadFile(file, token, queueItem) {
    const formData = new FormData();
    formData.append('file', file);
    
    const settings = JSON.parse(localStorage.getItem('customizationSettings') || '{}');
    const urlLength = settings.urlLength || 8; 
    
    const progressFill = queueItem.querySelector('.progress-fill');
    const statusText = queueItem.querySelector('.queue-status');
    
    statusText.textContent = 'Uploading...';
    
    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'X-URL-Length': urlLength.toString() 
            },
            body: formData
        });
        
        if (response.ok) {
            progressFill.style.width = '100%';
            statusText.innerHTML = '<i class="fas fa-check" style="color: var(--success);"></i> Complete';
            queueItem.style.borderColor = 'var(--success)';
            
            const result = await response.json();
            
            let shareLink;
            shareLink = `http://localhost:8000/img/${result.file.filename}`;
            
            showUploadSuccess(result.file.original_name, shareLink);
            loadStorageInfo();
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        statusText.innerHTML = '<i class="fas fa-times" style="color: var(--error);"></i> Failed';
        queueItem.style.borderColor = 'var(--error)';
        showNotification('Upload failed', 'error');
    }
}

function showUploadSuccess(filename, shareLink) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: var(--success);
        color: white;
        border-radius: 12px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
        max-width: 400px;
    `;
    notification.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <div>
            <div style="font-weight: 600;">${filename} uploaded successfully!</div>
            <div style="font-size: 0.9rem; margin-top: 8px; display: flex; gap: 8px; align-items: center;">
                <input type="text" value="${shareLink}" readonly style="
                    background: rgba(255,255,255,0.1); 
                    border: 1px solid rgba(255,255,255,0.2); 
                    color: white; 
                    padding: 6px 10px; 
                    border-radius: 6px; 
                    flex: 1; 
                    font-size: 0.8rem;
                    font-family: monospace;
                " onclick="this.select()">
                <button onclick="navigator.clipboard.writeText('${shareLink}'); showNotification('Link copied!', 'success')" style="
                    background: rgba(255,255,255,0.2); 
                    border: none; 
                    color: white; 
                    padding: 6px 10px; 
                    border-radius: 6px; 
                    cursor: pointer;
                    transition: all 0.3s ease;
                " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 8000);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#8b5cf6'};
        color: white;
        border-radius: 12px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 0 20px ${type === 'success' ? 'rgba(16, 185, 129, 0.3)' : type === 'error' ? 'rgba(239, 68, 68, 0.3)' : type === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(139, 92, 246, 0.3)'};
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
    `;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        ${message}
    `;
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