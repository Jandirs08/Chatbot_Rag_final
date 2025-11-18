import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient
import asyncio


@pytest.fixture(autouse=True)
def mock_user_repository(monkeypatch):

    # Clase fake que reemplaza a UserRepository completa
    class FakeUserRepository:

        def __init__(self, *args, **kwargs):
            pass

        async def find_by_email(self, email):
            hashed = "$2b$12$N/5mK89S/Sg0w0jL7R3r1.vSxYqZ0PXmTt8Q7uCucKD5dKNvXskSe"
            return {
                "_id": "507f1f77bcf86cd799439011",
                "email": email,
                "hashed_password": hashed,
                "is_active": True,
                "is_admin": email.startswith("admin"),
            }

        async def create(self, data):
            return {"inserted_id": "507f1f77bcf86cd799439011"}

        async def delete(self, query):
            return None

    # Reemplazar clase real por fake
    monkeypatch.setattr(
        "backend.database.user_repository.UserRepository",
        FakeUserRepository
    )


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def client():
    from backend.main import app
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
