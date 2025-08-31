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
        loadDashboardData();
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
            const files = await response.json();
            updateStats(files);
            drawChart(files);
            setupTimeFilters(files);
        }
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

function setupTimeFilters(files) {
    const timeFilters = document.querySelectorAll('.time-filter');
    timeFilters.forEach(filter => {
        filter.addEventListener('click', function() {
            timeFilters.forEach(f => f.classList.remove('active'));
            this.classList.add('active');
            const period = this.textContent;
            drawChart(files, period);
        });
    });
}
function updateStats(files) {
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);
    const todayFiles = files.filter(file => {
        const uploadDate = new Date(file.upload_date);
        const today = new Date();
        return uploadDate.toDateString() === today.toDateString();
    }).length;

    const usedMB = (totalSize / (1024 * 1024)).toFixed(2);
    const freeMB = (1000 - usedMB).toFixed(2);

    document.getElementById('totalUploads').textContent = totalFiles;
    document.getElementById('uploadsToday').textContent = todayFiles;
    document.getElementById('usedSpace').textContent = `${usedMB}MB`;
    document.getElementById('freeSpace').textContent = `${freeMB}MB`;
    document.getElementById('totalFiles').textContent = `${totalFiles} Files`;
}

function drawChart(files, period = '7d') {
    const canvas = document.getElementById('uploadChart');
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let days_count;
    switch(period) {
        case '24h': days_count = 1; break;
        case '7d': days_count = 7; break;
        case '14d': days_count = 14; break;
        case '30d': days_count = 30; break;
        default: days_count = 7;
    }
    
    const days = [];
    const uploads = [];
    
    for (let i = days_count - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayFiles = files.filter(file => {
            const uploadDate = new Date(file.upload_date);
            return uploadDate.toDateString() === date.toDateString();
        });
        
        if (period === '24h') {
            days.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        } else if (days_count <= 7) {
            days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        } else {
            days.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
        uploads.push(dayFiles.length);
    }
    
    const padding = 60;
    const chartWidth = canvas.width - (padding * 2);
    const chartHeight = canvas.height - (padding * 2);
    const maxUploads = Math.max(...uploads, 1);
    const stepSize = Math.max(1, Math.floor((days_count - 1) / 6));
    
    ctx.strokeStyle = '#2d2d4a';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + chartWidth, y);
        ctx.stroke();
    }
    
    for (let i = 0; i < days_count; i += stepSize) {
        const x = padding + (chartWidth / (days_count - 1)) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, padding + chartHeight);
        ctx.stroke();
    }
    
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    for (let i = 0; i < uploads.length; i++) {
        const x = padding + (chartWidth / (days_count - 1)) * i;
        const y = padding + chartHeight - (uploads[i] / maxUploads) * chartHeight;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    
    ctx.fillStyle = '#8b5cf6';
    for (let i = 0; i < uploads.length; i++) {
        const x = padding + (chartWidth / (days_count - 1)) * i;
        const y = padding + chartHeight - (uploads[i] / maxUploads) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    ctx.fillStyle = '#b8b8d4';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    
    for (let i = 0; i < days.length; i += stepSize) {
        const x = padding + (chartWidth / (days_count - 1)) * i;
        ctx.fillText(days[i], x, canvas.height - 20);
    }
    
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        const value = Math.round(maxUploads - (maxUploads / 5) * i);
        ctx.fillText(value.toString(), padding - 10, y + 4);
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Uploads Over Time (${period})`, canvas.width / 2, 30);
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});