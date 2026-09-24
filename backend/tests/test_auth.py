import pytest
from app.models.user import User

def test_register_success(client, db):
    """Test successful user registration."""
    response = client.post(
        "/auth/register",
        json={
            "name": "New User",
            "email": "newuser@example.com",
            "password": "Password123!",
            "password_confirm": "Password123!"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "New User"
    assert data["email"] == "newuser@example.com"
    assert "id" in data
    assert "message" in data
    assert "password_hash" not in data

def test_register_duplicate_email(client, test_user):
    """Test registration fails with duplicate email."""
    response = client.post(
        "/auth/register",
        json={
            "name": "Another User",
            "email": "test@example.com",
            "password": "Password123!",
            "password_confirm": "Password123!"
        }
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Email is already registered"

def test_register_invalid_email(client):
    """Test registration fails with invalid email."""
    response = client.post(
        "/auth/register",
        json={
            "name": "User",
            "email": "not-an-email",
            "password": "Password123!",
            "password_confirm": "Password123!"
        }
    )
    assert response.status_code == 422

def test_register_weak_password(client):
    """Test registration fails with weak password."""
    # Too short
    response = client.post(
        "/auth/register",
        json={
            "name": "User",
            "email": "user1@example.com",
            "password": "Wk1",
            "password_confirm": "Wk1"
        }
    )
    assert response.status_code == 422
    
    # No uppercase
    response = client.post(
        "/auth/register",
        json={
            "name": "User",
            "email": "user2@example.com",
            "password": "password123!",
            "password_confirm": "password123!"
        }
    )
    assert response.status_code == 422
    
    # No digit
    response = client.post(
        "/auth/register",
        json={
            "name": "User",
            "email": "user3@example.com",
            "password": "Password!",
            "password_confirm": "Password!"
        }
    )
    assert response.status_code == 422

def test_register_password_mismatch(client):
    """Test registration fails when passwords do not match."""
    response = client.post(
        "/auth/register",
        json={
            "name": "User",
            "email": "user@example.com",
            "password": "Password123!",
            "password_confirm": "Password123!_different"
        }
    )
    assert response.status_code == 422

def test_register_missing_fields(client):
    """Test registration fails when fields are missing."""
    response = client.post(
        "/auth/register",
        json={
            "name": "User"
            # Missing email, password, etc.
        }
    )
    assert response.status_code == 422

def test_login_success(client, test_user):
    """Test successful login."""
    response = client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "Test1234!"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "test@example.com"
    assert "password_hash" not in data["user"]

def test_login_wrong_password(client, test_user):
    """Test login fails with incorrect password."""
    response = client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "WrongPassword!"
        }
    )
    assert response.status_code == 401

def test_login_nonexistent_user(client):
    """Test login fails with non-existent user."""
    response = client.post(
        "/auth/login",
        json={
            "email": "doesnotexist@example.com",
            "password": "Password123!"
        }
    )
    assert response.status_code == 401

def test_login_missing_fields(client):
    """Test login fails with missing fields."""
    response = client.post(
        "/auth/login",
        json={"email": "test@example.com"}
    )
    assert response.status_code == 422

def test_get_me_authenticated(client, test_user):
    """Test accessing protected route with valid token."""
    # First login to get token
    login_response = client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "Test1234!"
        }
    )
    token = login_response.json()["access_token"]
    
    # Then use token to access /me
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    
def test_get_me_no_password_in_response(client, test_user):
    """Security check: ensure password hash is not returned."""
    login_response = client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "Test1234!"
        }
    )
    token = login_response.json()["access_token"]
    
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert "password_hash" not in response.json()

def test_get_me_no_token(client):
    """Test accessing protected route without token fails."""
    response = client.get("/auth/me")
    assert response.status_code == 401

def test_get_me_invalid_token(client):
    """Test accessing protected route with invalid token fails."""
    response = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer invalid_token"}
    )
    assert response.status_code == 401

def test_logout_authenticated(client, test_user):
    """Test logout endpoint returns success message for authenticated user."""
    login_response = client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "Test1234!"
        }
    )
    token = login_response.json()["access_token"]
    
    response = client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Successfully logged out"

def test_logout_no_token(client):
    """Test logout fails without token."""
    response = client.post("/auth/logout")
    assert response.status_code == 401
