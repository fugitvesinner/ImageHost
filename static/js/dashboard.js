const API_URL = "http://localhost:8000";
let currentUser = null;
let userFiles = [];

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
        await loadDashboardData();
    } catch (error) {
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
            drawChart(userFiles);
            drawFileTypesChart(userFiles);
            setupTimeFilters(userFiles);
        } else {
            useMockData();
        }
    } catch (error) {
        useMockData();
    }
}

function useMockData() {
    const mockFiles = [];
    const now = new Date();
    const fileTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml'];

    for (let i = 0; i < 22; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const uploadDate = new Date(now);
        uploadDate.setDate(now.getDate() - daysAgo);

        mockFiles.push({
            id: i + 1,
            file_type: fileTypes[Math.floor(Math.random() * fileTypes.length)],
            file_size: Math.floor(Math.random() * 5000000) + 100000,
            upload_date: uploadDate.toISOString(),
            original_name: `image${i + 1}.${fileTypes[Math.floor(Math.random() * fileTypes.length)].split('/')[1]}`
        });
    }

    userFiles = mockFiles;
    updateStats(userFiles);
    drawChart(userFiles);
    drawFileTypesChart(userFiles);
    setupTimeFilters(userFiles);
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

function drawFileTypesChart(files) {
    const canvas = document.getElementById('fileTypesChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 200;

    const fileTypes = {
        'PNG': { count: 0, color: '#8b5cf6' },
        'JPG': { count: 0, color: '#06b6d4' },
        'GIF': { count: 0, color: '#10b981' },
        'SVG': { count: 0, color: '#f59e0b' },
        'Other': { count: 0, color: '#6a6a8a' }
    };

    files.forEach(file => {
        const type = file.file_type.toLowerCase();
        if (type.includes('png')) fileTypes.PNG.count++;
        else if (type.includes('jpeg') || type.includes('jpg')) fileTypes.JPG.count++;
        else if (type.includes('gif')) fileTypes.GIF.count++;
        else if (type.includes('svg')) fileTypes.SVG.count++;
        else fileTypes.Other.count++;
    });

    const total = Object.values(fileTypes).reduce((sum, type) => sum + type.count, 0);
    if (total === 0) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const outerRadius = 80;
    const innerRadius = 50;

    let currentAngle = -Math.PI / 2;

    Object.entries(fileTypes).forEach(([type, data]) => {
        if (data.count === 0) return;

        const sliceAngle = (data.count / total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, currentAngle, currentAngle + sliceAngle);
        ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
        ctx.closePath();
        ctx.fillStyle = data.color;
        ctx.fill();
        ctx.shadowColor = data.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        currentAngle += sliceAngle;
    });

    const legend = document.getElementById('fileTypesLegend');
    legend.innerHTML = '';

    Object.entries(fileTypes).forEach(([type, data]) => {
        if (data.count === 0) return;

        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
            <div class="legend-color" style="background: ${data.color};"></div>
            <span>${type} (${data.count})</span>
        `;
        legend.appendChild(legendItem);
    });
}

function setupTimeFilters(files) {
    const timeFilters = document.querySelectorAll('.time-filter');
    timeFilters.forEach(filter => {
        filter.addEventListener('click', function () {
            timeFilters.forEach(f => f.classList.remove('active'));
            this.classList.add('active');
            const period = this.textContent;
            drawChart(files, period);
        });
    });
}

function drawChart(files, period = '7d') {
    const canvas = document.getElementById('uploadChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let labels = [];
    let data = [];

    if (period === '24h') {
        const now = new Date();
        for (let i = 23; i >= 0; i--) {
            const hour = new Date(now);
            hour.setHours(now.getHours() - i);
            labels.push(`${hour.getHours().toString().padStart(2, '0')}:00`);
            const hourFiles = files.filter(file => {
                const uploadDate = new Date(file.upload_date);
                return uploadDate.getHours() === hour.getHours() &&
                    uploadDate.toDateString() === now.toDateString();
            });
            data.push(hourFiles.length);
        }
    } else {
        const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);

            if (days <= 7) {
                labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
            } else {
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            }
            const dayFiles = files.filter(file => {
                const uploadDate = new Date(file.upload_date);
                uploadDate.setHours(0, 0, 0, 0);
                date.setHours(0, 0, 0, 0);
                return uploadDate.getTime() === date.getTime();
            });
            data.push(dayFiles.length);
        }
    }

    const padding = { top: 40, right: 30, bottom: 50, left: 60 };
    const width = canvas.width - padding.left - padding.right;
    const height = canvas.height - padding.top - padding.bottom;

    const maxValue = Math.max(...data, 1);

    ctx.strokeStyle = '#2d2d4a';
    ctx.lineWidth = 1;

    const horizontalLines = 5;
    for (let i = 0; i <= horizontalLines; i++) {
        const y = padding.top + (height / horizontalLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + width, y);
        ctx.stroke();

        ctx.fillStyle = '#b8b8d4';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(maxValue - (maxValue / horizontalLines) * i), padding.left - 10, y);
    }

    ctx.beginPath();
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < data.length; i++) {
        const x = padding.left + (width / (data.length - 1)) * i;
        const y = padding.top + height - (data[i] / maxValue) * height;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    for (let i = 0; i < data.length; i++) {
        const x = padding.left + (width / (data.length - 1)) * i;
        const y = padding.top + height - (data[i] / maxValue) * height;

        ctx.beginPath();
        ctx.fillStyle = '#8b5cf6';
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#b8b8d4';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const labelStep = Math.max(1, Math.floor(data.length / 8));
    for (let i = 0; i < data.length; i += labelStep) {
        const x = padding.left + (width / (data.length - 1)) * i;
        ctx.fillText(labels[i], x, padding.top + height + 15);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Uploads Over Time (${period})`, canvas.width / 2, 15);
}

function downloadConfig() {
    const config = {
        anonymousUpload: document.getElementById('anonymousUpload')?.checked || false,
        discordEmbed: document.getElementById('discordEmbed')?.checked || true,
        autoDeleteDays: document.getElementById('autoDeleteDays')?.value || 0,
        urlLength: document.getElementById('urlLength')?.value || 8
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pixeldust-config.json';
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Configuration downloaded successfully!', 'success');
}

async function exportFiles() {
    showNotification('Preparing export... This may take a moment.', 'info');
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/files/export`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            showNotification('Failed to export files.', 'error');
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exported-files.zip';
        a.click();
        URL.revokeObjectURL(url);

        showNotification('Files exported successfully!', 'success');
    } catch (error) {
        showNotification('Export failed.', 'error');
    }
}

function confirmWipeImages() {
    document.getElementById('confirmTitle').textContent = "Confirm Deletion";
    document.getElementById('confirmMessage').textContent = "Are you sure you want to permanently delete all your images? This action cannot be undone.";
    document.getElementById('confirmModal').style.display = 'flex';
}

function saveCustomizationSettings() {
    try {
        const existingSettings = JSON.parse(localStorage.getItem('customizationSettings') || '{}');
        const newSettings = { ...existingSettings };
        const anonymousUpload = document.getElementById('anonymousUpload')?.checked;
        if (anonymousUpload !== undefined && anonymousUpload !== null) {
            newSettings.anonymousUpload = anonymousUpload;
        }

        const discordEmbed = document.getElementById('discordEmbed')?.checked;
        if (discordEmbed !== undefined && discordEmbed !== null) {
            newSettings.discordEmbed = discordEmbed;
        }

        const autoDeleteDays = document.getElementById('autoDeleteDays')?.value;
        if (autoDeleteDays !== undefined && autoDeleteDays !== null && autoDeleteDays !== '') {
            newSettings.autoDeleteDays = parseInt(autoDeleteDays);
        }

        const urlLength = document.getElementById('urlLength')?.value;
        if (urlLength !== undefined && urlLength !== null && urlLength !== '') {
            let value = parseInt(urlLength);
            if (value < 4) value = 4;
            if (value > 20) value = 20;
            newSettings.urlLength = value;
        }

        localStorage.setItem('customizationSettings', JSON.stringify(newSettings));
        showNotification('Settings saved successfully!', 'success');
    } catch (error) {
        showNotification('Error saving settings', 'error');
    }
}

function resetCustomizationSettings() {
    try {
        if (confirm("Reset all settings to default values?")) {
            document.getElementById('anonymousUpload').checked = false;
            document.getElementById('discordEmbed').checked = true;
            document.getElementById('autoDeleteDays').value = 0;
            document.getElementById('urlLength').value = 8;

            showNotification("Settings have been reset to defaults.", 'info');
        }
    } catch (error) {
        showNotification('Error resetting settings', 'error');
    }
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

function showNotification(message, type = 'info') {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';

    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        ${message}
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

document.addEventListener('DOMContentLoaded', function () {
    checkAuth();

    document.getElementById('confirmButton').addEventListener('click', async function () {
        const token = localStorage.getItem('token');

        try {
            const response = await fetch(`${API_URL}/files/wipe`, {
                method: 'DELETE',
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (response.ok) {
                const result = await response.json();
                showNotification(result.message || 'All images have been deleted.', 'success');
                userFiles = [];
                updateStats(userFiles);
                drawChart(userFiles);
                drawFileTypesChart(userFiles);
            } else {
                let errorMessage = 'Failed to delete files.';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorData.message || errorMessage;
                } catch (e) {
                    errorMessage = response.statusText || errorMessage;
                }
                showNotification(errorMessage, 'error');
            }
        } catch (error) {
            showNotification('Network error: Could not connect to server.', 'error');
        }
        closeConfirmModal();
    });

    const savedSettings = localStorage.getItem('customizationSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.anonymousUpload !== undefined) {
            document.getElementById('anonymousUpload').checked = settings.anonymousUpload;
        }

        if (settings.discordEmbed !== undefined) {
            document.getElementById('discordEmbed').checked = settings.discordEmbed;
        }

        if (settings.autoDeleteDays !== undefined) {
            document.getElementById('autoDeleteDays').value = settings.autoDeleteDays;
        }

        if (settings.urlLength !== undefined) {
            document.getElementById('urlLength').value = settings.urlLength;
        }
    }
});

window.addEventListener('resize', function () {
    if (userFiles && userFiles.length > 0) {
        const activePeriod = document.querySelector('.time-filter.active');
        if (activePeriod) {
            drawChart(userFiles, activePeriod.textContent);
        }
    }
});