const API_URL = "http://localhost:8000";
const MAX_STORAGE_MB = 1000;

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

        loadStorageInfo();
        setupUpload();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
    }
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
        }
    } catch (error) {
        console.error('Failed to load storage info:', error);
    }
}

function setupUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.onclick = () => fileInput.click();
    
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
        alert(`Upload would exceed storage limit of ${MAX_STORAGE_MB}MB. Current usage: ${(currentUsage / (1024 * 1024)).toFixed(2)}MB`);
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
    
    const progressFill = queueItem.querySelector('.progress-fill');
    const statusText = queueItem.querySelector('.queue-status');
    
    statusText.textContent = 'Uploading...';
    
    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (response.ok) {
            progressFill.style.width = '100%';
            statusText.innerHTML = '<i class="fas fa-check" style="color: var(--success);"></i> Complete';
            queueItem.style.borderColor = 'var(--success)';
            loadStorageInfo();
            
            showNotification('File uploaded successfully!', 'success');
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--accent-primary)'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function copyFileLink(fileId) {
    const link = `http://localhost:8000/img/${fileId}`;
    navigator.clipboard.writeText(link).then(() => {
        showNotification('Link copied to clipboard!', 'success');
    });
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});