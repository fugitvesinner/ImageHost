# PixelDust - Image Hosting Website

![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)  ![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi)  ![Postgres](https://img.shields.io/badge/PostgreSQL-15+-336791?logo=postgresql) 

PixelDust is a self-hosted **image hosting and file management API** built with [FastAPI](https://fastapi.tiangolo.com/).  
It supports user authentication, file uploads, session tracking, customizable settings, and secure file delivery with Discord embed compatibility.  

---

## 🚀 Features  
- User registration & login (JWT-based authentication)  
- Secure password hashing (`bcrypt` / `sha256_crypt` via Passlib)  
- Session management with device, IP, and user-agent tracking  
- File uploads with per-user storage limits  
- Discord-friendly `/img/` route for embeds  
- File views & download tracking  
- User settings (theme, auto-delete, profile privacy, etc.)  
- Profile updates & password changes  
- RESTful JSON API responses  
- CORS enabled  
- Optional **desktop startup notification** (via [Plyer](https://github.com/kivy/plyer))  
- Embedded static dashboard pages (`index.html`, `dashboard.html`, `upload.html`)  

---

## 📦 Requirements  

- Python **3.12+**  
- PostgreSQL database  
- Node.js (optional, if you want to build frontend)  

### Python Dependencies  
Installed via `pip install -r requirements.txt`:  
- fastapi  
- uvicorn  
- asyncpg  
- aiofiles  
- passlib  
- python-dotenv  
- python-jose  
- plyer *(optional)*  

---

## ⚙️ Setup  

1. ### **Clone the repo**  
   ```bash
   git clone https://github.com/your-username/pixeldust.git
   cd pixeldust
   ```

2. ### Create a virtual environment

    ```bash
    python -m venv venv
    source venv/bin/activate   # macOS/Linux
    venv\Scripts\activate      # Windows
    ```

3. ### Install dependencies

    ```bas
    pip install -r requirements.txt```


3. ### Set environment variables

    Create a `.env` file in the project root:

    ```bash
    SECRET_KEY=your-secret-key
    POSTGRES=postgresql://user:password@localhost:5432/database
    ```

5. ### Prepare the database
    
    Run migrations / create the following tables in PostgreSQL:

    - `users`

    - `user_settings`

    - `user_sessions`

    - `files`

### ▶️ Running the Server

Start the FastAPI server (with embed proxy):

```bash
python main.py
```

- API runs on: http://localhost:8000

- Embed redirect server: http://localhost:8080

    Static files (HTML/CSS/JS) are served from /static.


### 🔑 Auth Endpoints

| Method | Endpoint        | Description       |
|--------|----------------|-------------------|
| POST   | `/register`    | Create a new user |
| POST   | `/login`       | Login & get token |
| GET    | `/users/me`    | Get current user  |




### 📂 File Handling

- Upload: `POST /upload`

- View file info: `GET /files/{file_id}/info`

- Direct link (Discord embed friendly): `/img/{filename}`

- Raw file link: `/raw/{filename}`

- Delete file: `DELETE /files/{file_id}`


### ⚡ Storage

- Per-user storage limit: 1000 MB

- Max single upload size: 10 MB (configurable)


### 🖥️ Example Frontend

Static dashboard pages are included:

- `/ → index.html`

- `/dashboard.html`

- `/upload.html`

You can replace these with your own frontend.


### 🙌 Credits

- Built with [FastAPI](https://fastapi.tiangolo.com/)

- Database powered by [PostgreSQL](https://www.postgresql.org/)

- Notifications via [Plyer](https://github.com/kivy/plyer)

> 💡 Pro Tip: You can configure the max upload size and storage limit in `main.py`.

## ❗ Important  
> Make sure to run database migrations before starting the server.  


<p align="center">
  <img src="assets/banner.jpg" width="700" alt="PixelDust Banner"/>
</p>

### IMPPPPPPPPPPPPPPP 🚨🚨🚨🚨🚨🚨

> **__BIG SKIDDERS YOKOSO__**