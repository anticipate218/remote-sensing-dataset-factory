"""
认证模块 - JWT + SQLite 用户系统
"""
import os
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
import jwt

router = APIRouter(prefix="/auth", tags=["认证"])

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "users.db")
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "环境变量 JWT_SECRET 未设置。请在 .env 中生成一个随机字符串，例如:\n"
        "  python -c \"import secrets; print(secrets.token_hex(32))\""
    )
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_login TEXT
        )
    """)
    conn.commit()
    conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{h}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, h = password_hash.split(":")
        return hashlib.sha256((password + salt).encode()).hexdigest() == h
    except Exception:
        return False


def create_token(user_id: int, username: str) -> str:
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


async def get_current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    token = authorization[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="令牌无效或已过期")
    return payload


@router.post("/register")
async def register(req: RegisterRequest):
    if len(req.username) < 2 or len(req.username) > 32:
        raise HTTPException(status_code=400, detail="用户名长度需 2-32 个字符")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="密码长度至少 6 个字符")

    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (req.username,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="用户名已存在")

        password_hash = hash_password(req.password)
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
            (req.username, password_hash, req.email)
        )
        conn.commit()
        user_id = cursor.lastrowid
        token = create_token(user_id, req.username)
        return {
            "message": "注册成功",
            "token": token,
            "user": {"id": user_id, "username": req.username, "email": req.email}
        }
    finally:
        conn.close()


@router.post("/login")
async def login(req: LoginRequest):
    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE username = ?", (req.username,)).fetchone()
        if not user or not verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        conn.execute("UPDATE users SET last_login = ? WHERE id = ?",
                     (datetime.now().isoformat(), user["id"]))
        conn.commit()

        token = create_token(user["id"], user["username"])
        return {
            "message": "登录成功",
            "token": token,
            "user": {"id": user["id"], "username": user["username"], "email": user["email"]}
        }
    finally:
        conn.close()


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute("SELECT id, username, email, created_at, last_login FROM users WHERE id = ?",
                          (user["user_id"],)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "created_at": row["created_at"],
            "last_login": row["last_login"],
        }
    finally:
        conn.close()


# 启动时初始化数据库
init_db()
