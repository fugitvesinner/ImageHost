const API_URL = "http://localhost:8000";
let allFiles = [];
let currentFile = null;

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

        loadFiles();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
    }
}

// Load Files
async function loadFiles() {
    const token = localStorage.getItem('token');
    const filesGrid = document.getElementById('filesGrid');
    
    filesGrid.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading files...</div>';

    try {
        const response = await fetch(`${API_URL}/files`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            allFiles = await response.json();
            displayFiles(allFiles);
        } else {
            filesGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-images"></i>
                    <h3>Failed to load files</h3>
                    <p>Please try refreshing the page</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load files:', error);
        filesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Connection Error</h3>
                <p>Unable to connect to server</p>
            </div>
        `;
    }
}

function displayFiles(files) {
    const filesGrid = document.getElementById('filesGrid');
    
    if (files.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state-centered">
                <i class="fas fa-images"></i>
                <h3>No files uploaded yet</h3>
                <p>Start by uploading your first image</p>
                <button class="btn-primary" onclick="window.location.href='/static/upload.html'">
                    <i class="fas fa-upload"></i> Upload Now
                </button>
            </div>
        `;
        return;
    }

    filesGrid.innerHTML = '';
    
    files.forEach(file => {
        const fileCard = createFileCard(file);
        filesGrid.appendChild(fileCard);
    });
}

function createFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';
    
    const isImage = file.file_type.startsWith('image/');
    const fileSize = formatFileSize(file.file_size);
    const uploadDate = new Date(file.upload_date).toLocaleDateString();
    
    card.innerHTML = `
        <div class="file-preview">
            ${isImage 
                ? `<img src="${API_URL}/raw/${file.filename}" alt="${file.original_name}" class="file-thumbnail" loading="lazy">`
                : `<i class="fas fa-file file-icon"></i>`
            }
            <div class="file-actions">
                <button class="action-btn" onclick="event.stopPropagation(); copyFileLink(${file.id})" title="Copy Link">
                    <i class="fas fa-link"></i>
                </button>
                <button class="action-btn" onclick="event.stopPropagation(); downloadFile(${file.id})" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <button class="action-btn" onclick="event.stopPropagation(); deleteFile(${file.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="file-info">
            <div class="file-name" title="${file.original_name}">${file.original_name}</div>
            <div class="file-meta">
                <span class="file-size">${fileSize}</span>
                <span class="file-date">${uploadDate}</span>
            </div>
        </div>
    `;
    
    card.onclick = () => openImageInNewTab(file);
    return card;
}

function openImageInNewTab(file) {
    window.open(`/view/${file.filename}`, '_blank');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function copyFileLink(fileId) {
    const file = allFiles.find(f => f.id === fileId);
    if (!file) return;
    
    const settings = JSON.parse(localStorage.getItem('customizationSettings') || '{}');
    let link;
    
    if (settings.invisibleUrl) {
        link = `https://i-love-your.mom/${file.filename}`;
    } else {
        link = `http://localhost:8000/img/${file.filename}`;
    }
    
    navigator.clipboard.writeText(link).then(() => {
        showNotification('Link copied to clipboard!', 'success');
    });
}

function downloadFile(fileId) {
    const file = allFiles.find(f => f.id === fileId);
    if (file) {
        window.open(`${API_URL}/raw/${file.filename}`, '_blank');
    }
}

async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showNotification('File deleted successfully!', 'success');
            loadFiles();
        } else {
            showNotification('Failed to delete file', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Failed to delete file', 'error');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
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

// Search and Sort
document.getElementById('searchInput').addEventListener('input', function() {
    applyFiltersAndSort();
});

document.getElementById('sortSelect').addEventListener('change', function() {
    applyFiltersAndSort();
});

document.getElementById('typeFilter').addEventListener('change', function() {
    applyFiltersAndSort();
});

function applyFiltersAndSort() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortBy = document.getElementById('sortSelect').value;
    const typeFilter = document.getElementById('typeFilter').value;
    
    let filteredFiles = allFiles.filter(file => {
        const matchesSearch = file.original_name.toLowerCase().includes(searchTerm);
        const matchesType = typeFilter === 'all' || 
            (typeFilter === 'png' && file.file_type.includes('png')) ||
            (typeFilter === 'jpg' && (file.file_type.includes('jpeg') || file.file_type.includes('jpg'))) ||
            (typeFilter === 'gif' && file.file_type.includes('gif')) ||
            (typeFilter === 'svg' && file.file_type.includes('svg'));
        
        return matchesSearch && matchesType;
    });
    
    switch(sortBy) {
        case 'newest':
            filteredFiles.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
            break;
        case 'oldest':
            filteredFiles.sort((a, b) => new Date(a.upload_date) - new Date(b.upload_date));
            break;
        case 'largest':
            filteredFiles.sort((a, b) => b.file_size - a.file_size);
            break;
        case 'smallest':
            filteredFiles.sort((a, b) => a.file_size - b.file_size);
            break;
        case 'name':
            filteredFiles.sort((a, b) => a.original_name.localeCompare(b.original_name));
            break;
        case 'type':
            filteredFiles.sort((a, b) => a.file_type.localeCompare(b.file_type));
            break;
    }
    
    displayFiles(filteredFiles);
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});