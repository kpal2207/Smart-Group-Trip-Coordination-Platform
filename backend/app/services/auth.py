import json
import urllib.request
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from app.config import settings

# Initialize password hasher with Argon2
password_hash_manager = PasswordHash((Argon2Hasher(),))

_jwks_cache = None


def _get_supabase_jwks(supabase_url: str):
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    if not supabase_url:
        return None
    try:
        url = supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
        req = urllib.request.Request(url, headers={"User-Agent": "FastAPI-Backend"})
        with urllib.request.urlopen(req, timeout=5) as response:
            _jwks_cache = json.loads(response.read().decode("utf-8"))
            return _jwks_cache
    except Exception:
        return None


def hash_password(password: str) -> str:
    """Hash a password using Argon2 via pwdlib."""
    return password_hash_manager.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return password_hash_manager.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a JWT access token. Include 'sub' (user email) and 'exp' in payload.
    """
    to_encode = data.copy()
    
    # Set expiration time
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    
    # Encode the JWT using the secret key and algorithm from settings
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict | None:
    """
    Decode and validate a JWT token (supports Supabase ES256/HS256 tokens and local HS256).
    """
    # 1. Try local settings SECRET_KEY first (for test suite and custom JWTs)
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        pass

    # 2. Try Supabase JWKS (for Supabase ECC P-256 / ES256 and HS256 tokens)
    if settings.SUPABASE_URL:
        jwks = _get_supabase_jwks(settings.SUPABASE_URL)
        if jwks:
            try:
                return jwt.decode(
                    token,
                    jwks,
                    algorithms=["ES256", "HS256"],
                    options={"verify_aud": False},
                )
            except JWTError:
                pass

    return None

