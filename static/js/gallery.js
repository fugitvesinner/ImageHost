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
            filesGrid.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i><h3>Failed to load files</h3><p>Please try refreshing the page</p></div>';
        }
    } catch (error) {
        console.error('Failed to load files:', error);
        filesGrid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Connection Error</h3><p>Unable to connect to server</p></div>';
    }
}

function displayFiles(files) {
    const filesGrid = document.getElementById('filesGrid');
    
    if (files.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state">
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
    const link = file ? `http://localhost:8000/img/${file.filename}` : `http://localhost:8000/files/${fileId}/view`;
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

document.getElementById('searchInput').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filteredFiles = allFiles.filter(file => 
        file.original_name.toLowerCase().includes(searchTerm)
    );
    displayFiles(filteredFiles);
});

document.getElementById('sortSelect').addEventListener('change', function(e) {
    const sortBy = e.target.value;
    let sortedFiles = [...allFiles];
    
    switch(sortBy) {
        case 'newest':
            sortedFiles.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
            break;
        case 'oldest':
            sortedFiles.sort((a, b) => new Date(a.upload_date) - new Date(b.upload_date));
            break;
        case 'largest':
            sortedFiles.sort((a, b) => b.file_size - a.file_size);
            break;
        case 'smallest':
            sortedFiles.sort((a, b) => a.file_size - b.file_size);
            break;
    }
    
    displayFiles(sortedFiles);
});

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeImageModal();
    }
});