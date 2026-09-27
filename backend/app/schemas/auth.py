from pydantic import BaseModel, EmailStr, ConfigDict, field_validator, model_validator
import re

class UserCreate(BaseModel):
    """
    Schema for creating a new user. Contains validation for password complexity.
    """
    name: str
    email: EmailStr
    password: str
    password_confirm: str

    @field_validator('name')
    @classmethod
    def name_must_be_valid(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Name cannot be empty")
        if len(v) > 100:
            raise ValueError("Name must be less than 100 characters")
        return v.strip()

    @field_validator('password')
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one digit')
        return v

    @model_validator(mode='after')
    def passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError('Passwords do not match')
        return self

class UserResponse(BaseModel):
    """
    Schema for returning user data. Note that it does not include password_hash.
    """
    id: int
    name: str
    email: str
    
    # Allows reading data directly from SQLAlchemy models
    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    """Schema for user login credentials."""
    email: EmailStr
    password: str

class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class MessageResponse(BaseModel):
    """Schema for simple message responses."""
    message: str

class RegisterResponse(UserResponse):
    """Schema for registration response, extending UserResponse with a message."""
    message: str = "Registration successful"
