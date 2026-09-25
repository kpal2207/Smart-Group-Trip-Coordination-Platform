from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.services.auth import decode_access_token

# Define the HTTP Bearer scheme for Swagger UI
security = HTTPBearer(auto_error=False)

def get_current_user(
    db: Session = Depends(get_db),
    token: HTTPAuthorizationCredentials | None = Depends(security)
) -> User:
    """
    FastAPI dependency: extract and validate JWT from Authorization header.
    Returns the authenticated User object.

    Usage by ANY module (Trip, Expense, etc.):
        @router.get('/some-endpoint')
        def endpoint(current_user: User = Depends(get_current_user)):
            # current_user.id, current_user.email, current_user.name are available
            ...

    Raises HTTPException 401 if token is missing, invalid, or expired.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Decode token to get payload
    payload = decode_access_token(token.credentials)
    if payload is None:
        raise credentials_exception

    email: str = payload.get("sub")
    if email is None:
        raise credentials_exception

    # Look up user in DB
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception

    return user
