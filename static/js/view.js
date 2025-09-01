const API_URL = "http://localhost:8000";
let currentFile = null;

function getFileIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

async function loadFile() {
    const fileId = getFileIdFromUrl();
    if (!fileId) {
        window.location.href = '/static/gallery.html';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/files/${fileId}/info`);
        
        if (response.ok) {
            currentFile = await response.json();
            displayFile();
            const token = localStorage.getItem('token');
            if (token) {
                document.getElementById('deleteBtn').style.display = 'inline-flex';
            }
        } else {
            showError('File not found');
        }
    } catch (error) {
        console.error('Failed to load file:', error);
        showError('Failed to load file');
    }
}

async function deleteCurrentImage() {
    if (!currentFile) return;
    
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    const token = localStorage.getItem('token');
    if (!token) {
        showNotification('You must be logged in to delete files', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/files/${currentFile.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showNotification('Image deleted successfully!', 'success');
            setTimeout(() => {
                window.location.href = '/static/gallery.html';
            }, 1500);
        } else {
            showNotification('Failed to delete image', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Failed to delete image', 'error');
    }
}

function displayFile() {
    if (!currentFile) return;
    
    const viewImage = document.getElementById('viewImage');
    const imageName = document.getElementById('imageName');
    const imageSize = document.getElementById('imageSize');
    const uploadDate = document.getElementById('uploadDate');
    const uploaderName = document.getElementById('uploaderName');
    
    viewImage.src = `${API_URL}/files/${currentFile.id}/view`;
    viewImage.alt = currentFile.original_name;
    imageName.textContent = currentFile.original_name;
    imageSize.textContent = formatFileSize(currentFile.file_size);
    uploadDate.textContent = `Uploaded ${new Date(currentFile.upload_date).toLocaleDateString()}`;
    
    const customSettings = JSON.parse(localStorage.getItem('customizationSettings') || '{}');
    if (customSettings.anonymousUpload) {
        uploaderName.textContent = 'Anonymous';
    } else {
        uploaderName.textContent = currentFile.uploader_name || 'Unknown User';
    }
}

function copyImageLink() {
    if (currentFile) {
        const customSettings = JSON.parse(localStorage.getItem('customizationSettings') || '{}');
        let link = `http://localhost:8000/img/${currentFile.filename}`;
        navigator.clipboard.writeText(link).then(() => {
            showNotification('Share link copied to clipboard!', 'success');
        });
    }
}

function downloadImage() {
    if (currentFile) {
        window.open(`${API_URL}/files/${currentFile.id}/view`, '_blank');
    }
}

function shareImage() {
    if (currentFile) {
        copyImageLink();
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showError(message) {
    document.querySelector('.image-viewer').innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Error</h3>
            <p>${message}</p>
            <button class="btn-primary" onclick="window.location.href='/static/gallery.html'">
                <i class="fas fa-arrow-left"></i> Back to Gallery
            </button>
        </div>
    `;
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

document.addEventListener('DOMContentLoaded', function() {
    loadFile();
});
