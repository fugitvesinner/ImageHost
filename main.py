import os
import random
import string
import uuid
import hashlib
import tempfile
import zipfile
import threading
import socketserver
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from utils.logger import log 
import aiofiles
import asyncpg
from dotenv import load_dotenv
from fastapi import (
    FastAPI, HTTPException, Depends, status, Request, UploadFile, File, Header
)
from plyer import notification # You can use it if you want to but i don't really think it would be needed because you would obviously host this in a vps and there's no way you are gonna receive notifcations of this right????
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import uvicorn


load_dotenv()

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "ciDWkgo-H35kCVC1erf9KtCOeOY527zt9n296fszrGY"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  
MAX_STORAGE_BYTES = 1000 * 1024 * 1024  

DATABASE_URL = os.getenv(
    "POSTGRES",
    "postgresql://postgres:postgres@localhost:5432/pixeldust"
)


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
        schemes=[
            "sha256_crypt"
            ], 
            deprecated="auto"
            )

def verify_password(
        plain_password: str, 
        hashed_password: str
        ) -> bool:
    return pwd_context.verify(
        plain_password, 
        hashed_password
        )

def get_password_hash(
        password: str
        ) -> str:
    return pwd_context.hash(
        password
        )


def create_access_token(
        data: dict, 
        expires_delta: Optional[timedelta] = None
        ) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(
        to_encode, 
        SECRET_KEY, 
        algorithm=ALGORITHM
        )

def generate_random_filename(
        length: int = 8
        ) -> str:
    """Generate a random alphanumeric string for filenames."""
    return ''.join(
        random.choices(
            string.ascii_letters + string.digits,
            k=length
            ))


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/login"
    )


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
    url_length: int = 8
    anonymous_upload: bool = False


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


app = FastAPI(
    title="PixelDust Image Hosting"
    )


STATIC_DIR = Path(
    "static"
    )
STATIC_DIR.mkdir(
    exist_ok=True
    )
app.mount(
    "/static", 
    StaticFiles(
        directory=str(STATIC_DIR)
        ), 
        name="static"
        )

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


async def db_connect():
    try:
        return await asyncpg.connect(
            DATABASE_URL
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed. Check POSTGRES env. Error: {e}"
        )






async def get_current_user(
        token: str = Depends(
            oauth2_scheme
            )) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication credentials",
        headers={
            "WWW-Authenticate": "Bearer"
            }
    )
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY, 
            algorithms=[
                ALGORITHM
                ])
        email: str = payload.get(
            "sub"
            )
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    conn = await db_connect()
    try:
        user = await conn.fetchrow(
            "SELECT id, name, email, created_at FROM users WHERE email = $1",
            email
        )
    finally:
        await conn.close()

    if not user:
        raise credentials_exception
    return dict(user)

async def create_session(
        user_id: int, 
        request: Request
        ) -> str:
    session_token = hashlib.sha256(
        f"{user_id}{datetime.now(timezone.utc)}".encode()
    ).hexdigest()

    
    client_ip = "127.0.0.1"
    if "x-forwarded-for" in request.headers:
        client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
    elif "x-real-ip" in request.headers:
        client_ip = request.headers["x-real-ip"]
    elif hasattr(request, "client") and request.client:
        client_ip = request.client.host

    conn = await db_connect()
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


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}

@app.get("/")
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(
            str(index_path)
            )
    return HTMLResponse(
        "<h1>PixelDust API</h1><p>Static UI not found.</p>"
        )

@app.get("/dashboard.html")
async def serve_dashboard():
    path = STATIC_DIR / "dashboard.html"
    return FileResponse(
        str(path)) if path.exists() else HTMLResponse(
            "<h1>dashboard.html missing</h1>"
            , status_code=404
            )

@app.get("/upload.html")
async def serve_upload():
    path = STATIC_DIR / "upload.html"
    return FileResponse(
        str(path)) if path.exists() else HTMLResponse(
            "<h1>upload.html missing</h1>",
            status_code=404
            )


@app.post("/register", response_model=UserResponse)
async def register(
    user: UserCreate, 
    request: Request
    ):
    conn = await db_connect()
    try:
        existing_user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", user.email)
        if existing_user:
            raise HTTPException(
                status_code=400, 
                detail="Email already registered"
                )

        hashed_password = get_password_hash(
            user.password
            )
        new_user = await conn.fetchrow(
            """
            INSERT INTO users (name, email, password)
            VALUES ($1, $2, $3)
            RETURNING id, name, email, created_at
            """,
            user.name, user.email, hashed_password,
        )

        await conn.execute(
            "INSERT INTO user_settings (user_id) VALUES ($1)",
            new_user["id"]
        )
    finally:
        await conn.close()

    
    await create_session(new_user["id"], request)
    return dict(new_user)

@app.post("/login", response_model=Token)
async def login(
    credentials: UserLogin, 
    request: Request
    ):
    conn = await db_connect()
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
            headers={
                "WWW-Authenticate": "Bearer"
                },
        )

    access_token = create_access_token(
        data={
            "sub": user["email"]
            },
        expires_delta=timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
            ),
    )
    await create_session(
        user["id"], request
        )
    return {
        "access_token": access_token, 
        "token_type": "bearer"}

@app.get("/users/me", response_model=UserResponse)
async def get_user(
    current_user: dict = Depends(get_current_user)
    ):
    return current_user


@app.get("/files", response_model=List[FileResponseModel])
async def get_user_files(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
    try:
        rows = await conn.fetch(
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
    return [dict(r) for r in rows]

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user),
    url_length: Optional[int] = Header(8, alias="X-URL-Length")
):
    allowed_types = {
        "image/png", 
        "image/jpeg", 
        "image/jpg", 
        "image/gif", 
        "image/svg+xml"
        }
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
    
    conn = await db_connect()
    try:
        current_usage = await conn.fetchval(
            "SELECT COALESCE(SUM(file_size), 0) FROM files WHERE user_id = $1",
            current_user["id"]
        )
        if (current_usage or 0) + len(content) > MAX_STORAGE_BYTES:
            raise HTTPException(
                status_code=400, 
                detail="Storage limit exceeded. Maximum 1000MB allowed"
                )
    finally:
        await conn.close()

    file_extension = Path(file.filename).suffix
    random_name = generate_random_filename(url_length)  
    unique_filename = f"{random_name}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    conn = await db_connect()
    try:
        rec = await conn.fetchrow(
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

    return {"message": "File uploaded successfully", "file": dict(rec)}

@app.get("/files/{file_id}/view")
async def view_file(
    file_id: int
    ):
    conn = await db_connect()
    try:
        rec = await conn.fetchrow(
            "SELECT file_path, original_name, file_type FROM files WHERE id = $1",
            file_id
        )
        if not rec:
            raise HTTPException(
                status_code=404, 
                detail="File not found"
                )
        await conn.execute("UPDATE files SET views = views + 1 WHERE id = $1", file_id)
    finally:
        await conn.close()

    file_path = Path(rec["file_path"])
    if not file_path.exists():
        raise HTTPException(
            status_code=404, 
            detail="File not found on disk"
            )

    return FileResponse(
        file_path,
        media_type=rec["file_type"],
        filename=rec["original_name"],
    )

@app.get("/files/{file_id}/info")
async def get_file_info(
    file_id: int
    ):
    conn = await db_connect()
    try:
        rec = await conn.fetchrow(
            "SELECT id, filename, original_name, file_type, file_size, upload_date, views FROM files WHERE id = $1",
            file_id
        )
        if not rec:
            raise HTTPException(
                status_code=404, 
                detail="File not found"
                )
    finally:
        await conn.close()
    return dict(rec)

@app.get("/img/{filename}")
async def discord_embed_view(
    filename: str, 
    request: Request
    ):
    # user_agent = request.headers.get("user-agent", "").lower()
    # is_discord = "discordbot" in user_agent

    conn = await db_connect()
    try:
        rec = await conn.fetchrow(
            "SELECT id, original_name, file_type FROM files WHERE filename = $1",
            filename
        )
        if not rec:
            return FileResponse(
                str(STATIC_DIR / "404.html"), 
                status_code=404) if (STATIC_DIR / "404.html").exists() else JSONResponse(
                    {
                        "detail": "Not found"
                        }, 
                        404
                        )
        await conn.execute("UPDATE files SET views = views + 1 WHERE filename = $1", filename)
    finally:
        await conn.close()

    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        return FileResponse(
            str(STATIC_DIR / "404.html"), 
            status_code=404) if (STATIC_DIR / "404.html").exists() else JSONResponse(
                {
                    "detail": "Not found on disk"
                    }, 
                    404
                    )

    headers = {
        "Cache-Control": "public, max-age=31536000",
        "X-Content-Type-Options": "nosniff"
    }
    return FileResponse(
        file_path, 
        media_type=rec["file_type"], 
        filename=rec["original_name"], 
        headers=headers
        )

@app.get("/raw/{filename}")
async def raw_image_view(
    filename: str
    ):
    conn = await db_connect()
    try:
        rec = await conn.fetchrow(
            "SELECT id, original_name, file_type FROM files WHERE filename = $1",
            filename
        )
        if not rec:
            raise HTTPException(
                status_code=404, 
                detail="File not found"
                )
        await conn.execute("UPDATE files SET views = views + 1 WHERE filename = $1", filename)
    finally:
        await conn.close()

    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(
            status_code=404, 
            detail="File not found on disk"
            )

    return FileResponse(
        file_path,
        media_type=rec["file_type"],
        filename=rec["original_name"],
        headers={
            "Cache-Control": "public, max-age=31536000",
            "X-Content-Type-Options": "nosniff"
        }
    )

@app.get("/view/{filename}")
async def view_page_redirect(
    filename: str
    ):
    conn = await db_connect()
    try:
        rec = await conn.fetchrow("SELECT id FROM files WHERE filename = $1", filename)
        if not rec:
            return FileResponse(
                str(STATIC_DIR / "404.html"), 
                status_code=404) if (STATIC_DIR / "404.html").exists() else HTMLResponse(
                    "<h1>Not found</h1>", 
                    status_code=404
                    )
    finally:
        await conn.close()
    path = STATIC_DIR / "view.html"
    return FileResponse(
        str(path)) if path.exists() else HTMLResponse(
            "<h1>view.html missing</h1>", 
            status_code=404
            )


@app.get("/settings", response_model=UserSettings)
async def get_settings(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
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
    conn = await db_connect()
    try:
        await conn.execute(
            """
            UPDATE user_settings
               SET email_notifications = $1,
                   public_profile = $2,
                   auto_delete_after_days = $3,
                   max_file_size_mb = $4,
                   theme = $5,
                   url_length = $6,
                   anonymous_upload = $7
             WHERE user_id = $8
            """,
            settings.email_notifications,
            settings.public_profile,
            settings.auto_delete_after_days,
            settings.max_file_size_mb,
            settings.theme,
            settings.url_length,
            settings.anonymous_upload,
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
    conn = await db_connect()
    try:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1 AND id != $2",
            profile.email, current_user["id"]
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")

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
    conn = await db_connect()
    try:
        row = await conn.fetchrow("SELECT password FROM users WHERE id = $1", current_user["id"])
        if not row or not verify_password(
            password_data.current_password, 
            row["password"]
            ):
            raise HTTPException(
                status_code=400, 
                detail="Current password is incorrect"
                )

        new_hashed = get_password_hash(
            password_data.new_password
            )
        await conn.execute("UPDATE users SET password = $1 WHERE id = $2", new_hashed, current_user["id"])
    finally:
        await conn.close()
    return {"message": "Password changed successfully"}


@app.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
    try:
        rows = await conn.fetch(
            "SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY last_active DESC",
            current_user["id"]
        )
    finally:
        await conn.close()
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "session_token": r["session_token"],
            "device_info": r["device_info"],
            "ip_address": str(r["ip_address"]) if r["ip_address"] else None,
            "user_agent": r["user_agent"],
            "created_at": r["created_at"],
            "last_active": r["last_active"],
            "is_active": r["is_active"],
        })
    return out

@app.delete("/sessions/{session_token}")
async def terminate_session(
    session_token: str, 
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
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
            "DELETE FROM user_sessions WHERE session_token = $1",
            session_token
        )
    finally:
        await conn.close()
    if result == "DELETE 0":
        raise HTTPException(
            status_code=404, 
            detail="Session not found"
            )

    return {"message": "Session deleted successfully"}


@app.delete("/files/wipe")
async def wipe_user_files(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
    try:
        files = await conn.fetch(
            "SELECT id, filename, file_path FROM files WHERE user_id = $1",
            current_user["id"]
        )
        deleted_count = 0
        for f in files:
            fp = Path(f["file_path"]) if f["file_path"] else (UPLOAD_DIR / f["filename"])
            if fp.exists():
                try:
                    fp.unlink()
                    deleted_count += 1
                except Exception as e:
                    log.error(f"Failed to delete {fp}: {e}")

        await conn.execute("DELETE FROM files WHERE user_id = $1", current_user["id"])
    finally:
        await conn.close()

    return {"message": f"Removed {deleted_count} files and cleared file records."}


@app.delete("/files/{file_id}")
async def delete_file(
    file_id: int, 
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
    try:
        rec = await conn.fetchrow(
            "SELECT file_path FROM files WHERE id = $1 AND user_id = $2",
            file_id, current_user["id"]
        )
        if not rec:
            raise HTTPException(
                status_code=404, 
                detail="File not found"
                )
        await conn.execute("DELETE FROM files WHERE id = $1", file_id)
    finally:
        await conn.close()

    fp = Path(rec["file_path"])
    if fp.exists():
        try:
            fp.unlink()
        except Exception:
            pass
    return {"message": "File deleted successfully"}

@app.get("/storage/usage")
async def get_storage_usage(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
    try:
        usage = await conn.fetchval(
            "SELECT COALESCE(SUM(file_size), 0) FROM files WHERE user_id = $1",
            current_user["id"]
        )
    finally:
        await conn.close()

    usage = usage or 0
    return {
        "used_bytes": usage,
        "used_mb": round(usage / (1024 * 1024), 2),
        "limit_mb": 1000,
        "remaining_mb": round((MAX_STORAGE_BYTES - usage) / (1024 * 1024), 2),
    }

@app.get("/files/export")
async def export_user_files(
    current_user: dict = Depends(get_current_user)
    ):
    conn = await db_connect()
    try:
        rows = await conn.fetch(
            "SELECT filename, original_name FROM files WHERE user_id = $1",
            current_user["id"],
        )
        if not rows:
            raise HTTPException(
                status_code=404, 
                detail="No files to export"
                )

        tmpdir = tempfile.mkdtemp()
        zip_path = os.path.join(tmpdir, f"user_{current_user['id']}_files.zip")

        with zipfile.ZipFile(zip_path, "w") as zipf:
            for r in rows:
                file_path = os.path.join(str(UPLOAD_DIR), r["filename"])
                if os.path.exists(file_path):
                    zipf.write(file_path, arcname=r["original_name"])
    finally:
        await conn.close()

    return FileResponse(
        zip_path,
        filename=f"user_{current_user['id']}_files.zip",
        media_type="application/zip",
    )


class EmbedHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/img/"):
            filename = self.path[5:]  
            self.send_response(302)
            self.send_header("Location", f"http://localhost:8000/img/{filename}")
            self.end_headers()
        else:
            super().do_GET()

def run_embed_server():
    with socketserver.TCPServer(("", 8080), EmbedHandler) as httpd:
        log.info(
            "Embed server running on port 8080"
            )
        httpd.serve_forever()


if __name__ == "__main__":
    
    t = threading.Thread(
        target=run_embed_server, 
        daemon=True
        )
    t.start()
    log.info(
        "Starting PixelDust on http://localhost:8000"
        )
    uvicorn.run(
        app, 
        host="localhost", 
        port=8000
        )
