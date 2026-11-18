from pydantic import BaseModel, EmailStr, ConfigDict, field_validator, model_validator

class UserCreate(BaseModel):
    """
    Schema for creating a new user. Password format complexity is delegated to Supabase Auth.
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
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class MessageResponse(BaseModel):
    message: str

class RegisterResponse(UserResponse):
    message: str = "Registration successful"
