from fastapi import FastAPI, HTTPException, Depends, status, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional, List
import asyncpg
import aiofiles
import os
import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
from pathlib import Path
import threading
import uvicorn
import threading
from http.server import SimpleHTTPRequestHandler
import socketserver
load_dotenv()

try:
    from plyer import notification
    PLYER_AVAILABLE = True
except ImportError:
    PLYER_AVAILABLE = False
    print("Plyer not available for notifications")


SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key-for-development")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
MAX_STORAGE_BYTES = 1000 * 1024 * 1024  

try:
    pwd_context = CryptContext(
        schemes=[
        "bcrypt", 
        "sha256_crypt"
        ], 
        deprecated="auto"
        )
except Exception:
    pwd_context = CryptContext(
        schemes=
        ["sha256_crypt"]
        , 
        deprecated="auto"
        )

def show_startup_notification():
    if not PLYER_AVAILABLE:
        print(
            "Plyer not available for notifications"
            )
        return
    
    try:
        notification.notify(
            title='PixelDust Server',
            message='Application is starting on http://localhost:8000',
            timeout=5,
            app_name='PixelDust',
            app_icon="assets/favicon.ico" 
        )
    except Exception as e:
        print(
            f"Notification error: {e}"
            )

if PLYER_AVAILABLE:
    notification_thread = threading.Thread(
        target=show_startup_notification
        )
    notification_thread.daemon = True
    notification_thread.start()

app = FastAPI(
    title="PixelDust Image Hosting API"
    )
app.mount(
    "/static", 
    StaticFiles(
        directory="static"
        ), name="static")
UPLOAD_DIR = Path(
    "uploads"
    )
UPLOAD_DIR.mkdir(
    exist_ok=True
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

database_url = os.getenv("POSTGRES")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


class UserCreate(BaseModel):
    name: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str


class FileResponseModel(BaseModel):
    id: int
    filename: str
    original_name: str
    file_type: str
    file_size: int
    upload_date: datetime
    views: int = 0


class UserSettings(BaseModel):
    email_notifications: bool = True
    public_profile: bool = True
    auto_delete_after_days: int = 0
    max_file_size_mb: int = 10
    theme: str = "dark"


class SessionResponse(BaseModel):
    id: int
    user_id: int
    session_token: str
    device_info: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    last_active: datetime
    is_active: bool


class ProfileUpdate(BaseModel):
    name: str
    email: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def verify_password(
        plain_password, 
        hashed_password
        ):
    return pwd_context.verify(
        plain_password, 
        hashed_password
        )


def get_password_hash(
        password
        ):
    return pwd_context.hash(
        password
        )


def create_access_token(
        data: dict, 
        expires_delta: Optional[timedelta] = None
        ):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
        token: str = Depends(oauth2_scheme)
        ):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={
            "WWW-Authenticate": "Bearer"
            },
    )
    try:
        payload = jwt.decode(
            token, 
            SECRET_KEY, 
            algorithms=[ALGORITHM]
            )
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    conn = await asyncpg.connect(database_url)
    try:
        user = await conn.fetchrow(
            "SELECT id, name, email, created_at FROM users WHERE email = $1",
            email
        )
    finally:
        await conn.close()

    if user is None:
        raise credentials_exception
    return dict(user)


async def create_session(
        user_id: int, 
        request: Request
        ):
    session_token = hashlib.sha256(
        f"{user_id}{datetime.now(timezone.utc)}".encode()).hexdigest()
    
    
    client_ip = "127.0.0.1"  
    
    if "x-forwarded-for" in request.headers:
        client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
    elif "x-real-ip" in request.headers:
        client_ip = request.headers["x-real-ip"]
    elif hasattr(request, 'client') and request.client:
        client_ip = request.client.host
    
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(
            """
            INSERT INTO user_sessions (user_id, session_token, device_info, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5)
            """,
            user_id,
            session_token,
            None,
            client_ip,
            request.headers.get("user-agent", ""),
        )
    finally:
        await conn.close()
    return session_token


@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")


@app.get("/dashboard.html")
async def serve_dashboard():
    return FileResponse("static/dashboard.html")


@app.get("/upload.html")
async def serve_upload():
    return FileResponse("static/upload.html")


@app.post("/register", response_model=UserResponse)
async def register(
    user: UserCreate, 
    request: Request):
    conn = await asyncpg.connect(database_url)
    try:
        existing_user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", user.email)
        if existing_user:
            raise HTTPException(
                status_code=400, 
                detail="Email already registered"
                )

        hashed_password = get_password_hash(user.password)
        new_user = await conn.fetchrow(
            """INSERT INTO users (name, email, password)
               VALUES ($1, $2, $3)
               RETURNING id, name, email, created_at""",
            user.name, user.email, hashed_password
        )

        await conn.execute(
            "INSERT INTO user_settings (user_id) VALUES ($1)",
            new_user["id"]
        )
    finally:
        await conn.close()

    return dict(new_user)


@app.post("/login", response_model=Token)
async def login(
    credentials: UserLogin,
    request: Request
    ):
    conn = await asyncpg.connect(database_url)
    try:
        user = await conn.fetchrow(
            "SELECT id, name, email, password FROM users WHERE email = $1",
            credentials.email
        )
    finally:
        await conn.close()

    if not user or not verify_password(
        credentials.password, 
        user["password"]
        ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    access_token = create_access_token(
        data={"sub": user["email"]}, 
        expires_delta=access_token_expires
    )

    await create_session(
        user["id"], 
        request
        )

    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/users/me", response_model=UserResponse)
async def get_user(
    current_user: dict = Depends(get_current_user)
    ):
    return current_user


@app.get("/files", response_model=List[FileResponseModel])
async def get_user_files(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        files = await conn.fetch(
            """
            SELECT id, filename, original_name, file_type, file_size, upload_date, views
            FROM files
            WHERE user_id = $1
            ORDER BY upload_date DESC
            """,
            current_user["id"],
        )
    finally:
        await conn.close()
    return [dict(file) for file in files]


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user)
    ):
    allowed_types = [
        "image/png", 
        "image/jpeg", 
        "image/jpg", 
        "image/gif", 
        "image/svg+xml"
        ]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail="Unsupported file type"
            )

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=400, 
            detail="File too large. Maximum size is 10MB"
            )

    
    conn = await asyncpg.connect(database_url)
    try:
        current_usage = await conn.fetchval(
            "SELECT COALESCE(SUM(file_size), 0) FROM files WHERE user_id = $1",
            current_user["id"]
        )
        if current_usage + len(content) > MAX_STORAGE_BYTES:
            raise HTTPException(
                status_code=400, 
                detail="Storage limit exceeded. Maximum 1000MB allowed"
                )
    finally:
        await conn.close()

    file_extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    conn = await asyncpg.connect(database_url)
    try:
        file_record = await conn.fetchrow(
            """
            INSERT INTO files (user_id, filename, original_name, file_path, file_type, file_size)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, filename, original_name, file_type, file_size, upload_date, views
            """,
            current_user["id"],
            unique_filename,
            file.filename,
            str(file_path),
            file.content_type,
            len(content),
        )
    finally:
        await conn.close()

    return {"message": "File uploaded successfully", "file": dict(file_record)}


@app.get("/files/{file_id}/view")
async def view_file(
    file_id: int
    ):
    conn = await asyncpg.connect(database_url)
    try:
        file_record = await conn.fetchrow(
            "SELECT file_path, original_name, file_type FROM files WHERE id = $1",
            file_id
        )
        if not file_record:
            raise HTTPException(
                status_code=404, 
                detail="File not found"
                )

        await conn.execute("UPDATE files SET views = views + 1 WHERE id = $1", file_id)
    finally:
        await conn.close()

    file_path = Path(file_record["file_path"])
    if not file_path.exists():
        raise HTTPException(
            status_code=404, 
            detail="File not found on disk"
            )

    return FileResponse(
        file_path,
        media_type=file_record["file_type"],
        filename=file_record["original_name"],
    )


@app.get("/files/{file_id}/info")
async def get_file_info(
    file_id: int
    ):
    conn = await asyncpg.connect(database_url)
    try:
        file_record = await conn.fetchrow(
            "SELECT id, filename, original_name, file_type, file_size, upload_date, views FROM files WHERE id = $1",
            file_id
        )
        if not file_record:
            raise HTTPException(
                status_code=404, detail="File not found"
                )
    finally:
        await conn.close()
    
    return dict(file_record)

@app.get("/img/{filename}")
async def discord_embed_view(
    filename: str, 
    request: Request
    ):
    user_agent = request.headers.get("user-agent", "").lower()
    is_discord = "discordbot" in user_agent
    
    conn = await asyncpg.connect(database_url)
    try:
        file_record = await conn.fetchrow(
            "SELECT id, original_name, file_type FROM files WHERE filename = $1",
            filename
        )
        if not file_record:
            return FileResponse(
                "static/404.html", status_code=404
                )
        
        
        await conn.execute("UPDATE files SET views = views + 1 WHERE filename = $1", filename)
    finally:
        await conn.close()
    
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        return FileResponse("static/404.html", status_code=404)
    
    
    if is_discord:
        return FileResponse(
            file_path,
            media_type=file_record["file_type"],
            filename=file_record["original_name"],
            headers={
                "Cache-Control": "public, max-age=31536000",
                "X-Content-Type-Options": "nosniff"
            }
        )
    
    
    return FileResponse(
        file_path,
        media_type=file_record["file_type"],
        filename=file_record["original_name"],
        headers={
            "Cache-Control": "public, max-age=31536000",
            "X-Content-Type-Options": "nosniff"
        }
    )

@app.get("/raw/{filename}")
async def raw_image_view(
    filename: str
    ):
    conn = await asyncpg.connect(database_url)
    try:
        file_record = await conn.fetchrow(
            "SELECT id, original_name, file_type FROM files WHERE filename = $1",
            filename
        )
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")
        
        
        await conn.execute("UPDATE files SET views = views + 1 WHERE filename = $1", filename)
    finally:
        await conn.close()
    
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        file_path,
        media_type=file_record["file_type"],
        filename=file_record["original_name"],
        headers={
            "Cache-Control": "public, max-age=31536000",
            "X-Content-Type-Options": "nosniff"
        }
    )

@app.get("/view/{filename}")
async def view_page_redirect(
    filename: str
    ):
    conn = await asyncpg.connect(database_url)
    try:
        file_record = await conn.fetchrow(
            "SELECT id FROM files WHERE filename = $1",
            filename
        )
        if not file_record:
            return FileResponse("static/404.html", status_code=404)
    finally:
        await conn.close()
    
    return FileResponse(
        "static/view.html"
        )

@app.get("/settings", response_model=UserSettings)
async def get_settings(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        settings = await conn.fetchrow(
            "SELECT * FROM user_settings WHERE user_id = $1",
            current_user["id"]
        )
        if not settings:
            await conn.execute(
                "INSERT INTO user_settings (user_id) VALUES ($1)",
                current_user["id"]
            )
            return UserSettings()
    finally:
        await conn.close()

    return UserSettings(**dict(settings))


@app.put("/settings")
async def update_settings(
    settings: UserSettings, 
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(
            """
            UPDATE user_settings
            SET email_notifications = $1,
                public_profile = $2,
                auto_delete_after_days = $3,
                max_file_size_mb = $4,
                theme = $5
            WHERE user_id = $6
            """,
            settings.email_notifications,
            settings.public_profile,
            settings.auto_delete_after_days,
            settings.max_file_size_mb,
            settings.theme,
            current_user["id"],
        )
    finally:
        await conn.close()
    return {"message": "Settings updated successfully"}


@app.put("/profile")
async def update_profile(
    profile: ProfileUpdate, 
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1 AND id != $2",
            profile.email, current_user["id"]
        )
        if existing:
            raise HTTPException(
                status_code=400, 
                detail="Email already in use"
                )

        await conn.execute(
            "UPDATE users SET name = $1, email = $2 WHERE id = $3",
            profile.name, profile.email, current_user["id"]
        )
    finally:
        await conn.close()
    return {"message": "Profile updated successfully"}


@app.post("/change-password")
async def change_password(
    password_data: PasswordChange, 
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        user = await conn.fetchrow(
            "SELECT password FROM users WHERE id = $1",
            current_user["id"]
        )
        if not verify_password(
            password_data.current_password, user["password"]
            ):
            raise HTTPException(
                status_code=400, 
                detail="Current password is incorrect"
                )

        new_hashed = get_password_hash(password_data.new_password)
        await conn.execute(
            "UPDATE users SET password = $1 WHERE id = $2",
            new_hashed, current_user["id"]
        )
    finally:
        await conn.close()
    return {"message": "Password changed successfully"}


@app.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        rows = await conn.fetch(
            "SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY last_active DESC",
            current_user["id"]
        )
    finally:
        await conn.close()

    sessions = []
    for row in rows:
        sessions.append({
            "id": row["id"],
            "user_id": row["user_id"],
            "session_token": row["session_token"],
            "device_info": row["device_info"],
            "ip_address": str(row["ip_address"]) if row["ip_address"] else None,
            "user_agent": row["user_agent"],
            "created_at": row["created_at"],
            "last_active": row["last_active"],
            "is_active": row["is_active"],
        })
    return sessions


@app.delete("/sessions/{session_token}")
async def terminate_session(
    session_token: str, 
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        
        session = await conn.fetchrow(
            "SELECT user_id FROM user_sessions WHERE session_token = $1",
            session_token
        )
        
        if not session or session["user_id"] != current_user["id"]:
            raise HTTPException(
                status_code=404, 
                detail="Session not found"
                )
        
        result = await conn.execute(
            "UPDATE user_sessions SET is_active = false WHERE session_token = $1",
            session_token
        )
    finally:
        await conn.close()

    if result == "UPDATE 0":
        raise HTTPException(
            status_code=404, 
            detail="Session not found"
            )
    return {"message": "Session terminated successfully"}


@app.delete("/files/{file_id}")
async def delete_file(
    file_id: int, 
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        file_record = await conn.fetchrow(
            "SELECT file_path FROM files WHERE id = $1 AND user_id = $2",
            file_id, current_user["id"]
        )
        if not file_record:
            raise HTTPException(
                status_code=404, 
                detail="File not found"
                )

        await conn.execute("DELETE FROM files WHERE id = $1", file_id)
    finally:
        await conn.close()

    file_path = Path(file_record["file_path"])
    if file_path.exists():
        file_path.unlink()

    return {"message": "File deleted successfully"}


@app.get("/storage/usage")
async def get_storage_usage(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await asyncpg.connect(database_url)
    try:
        usage = await conn.fetchval(
            "SELECT COALESCE(SUM(file_size), 0) FROM files WHERE user_id = $1",
            current_user["id"]
        )
    finally:
        await conn.close()
    
    return {
        "used_bytes": usage,
        "used_mb": round(usage / (1024 * 1024), 2),
        "limit_mb": 1000,
        "remaining_mb": round((MAX_STORAGE_BYTES - usage) / (1024 * 1024), 2)
    }

if __name__ == "__main__":

    
    class EmbedHandler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path.startswith('/img/'):
                filename = self.path[5:]  
                
                self.send_response(302)
                self.send_header(
                    'Location', 
                    f'http://localhost:8000/img/{filename}'
                    )
                self.end_headers()
            else:
                super().do_GET()
    
    def run_embed_server():
        with socketserver.TCPServer(
            ("", 8080), 
            EmbedHandler) as httpd:
            print(
                "Embed server running on port 8080"
                )
            httpd.serve_forever()
    
    
    embed_thread = threading.Thread(
        target=run_embed_server, 
        daemon=True
        )
    embed_thread.start()
    
    
    uvicorn.run(app, host="localhost", port=8000)