import io
import os
import sys
import json
import base64
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    # Ensure backend root on sys.path
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if root not in sys.path:
        sys.path.insert(0, root)
    # Isolated env: DB and files dir
    db_path = tmp_path / "test.db"
    files_dir = tmp_path / "files"
    files_dir.mkdir(parents=True, exist_ok=True)
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["FILES_DIR"] = str(files_dir)
    os.environ["SECRET_KEY"] = "test-secret"
    # Reload database and app to pick up env
    dbmod = importlib.import_module("app.db.database")
    importlib.reload(dbmod)
    app_main = importlib.import_module("app.main")
    importlib.reload(app_main)
    # Create tables (main may have done it already; safe to call again)
    dbmod.Base.metadata.create_all(bind=dbmod.engine)
    return TestClient(app_main.app)


def create_and_login_user(username: str, client: TestClient) -> str:
    # Register requires a public key; use a dummy JWK and password
    dummy_jwk = json.dumps({"kty": "EC", "crv": "P-256", "x": "A", "y": "B"})
    res = client.post(
        "/auth/register",
        json={
            "username": username,
            "first_name": "t",
            "last_name": "t",
            "password": "pass123",
            "public_key_jwk": dummy_jwk,
        },
    )
    assert res.status_code == 200
    tok = res.json()["access_token"]
    return tok


def auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_upload_and_send_attachment_file_flow(client: TestClient, tmp_path):
    # Create two users and a private chat between them
    tok_a = create_and_login_user("alice", client)
    tok_b = create_and_login_user("bob", client)

    # Create/get private chat between A and B
    res = client.post(
        "/chats/private",
        json={"target_user_id": 2},
        headers=auth_headers(tok_a),
    )
    assert res.status_code == 200
    chat_id = res.json()["id"]

    # Prepare an encrypted payload (simulate pre-encrypted bytes)
    # For API layer test we don't need valid AES-GCM; server stores as-is
    ciphertext = os.urandom(128)
    nonce = base64.b64encode(os.urandom(12)).decode()

    # Upload file
    files = {"file": ("report.docx", io.BytesIO(ciphertext), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    res = client.post(
        "/files/upload",
        files=files,
        headers={**auth_headers(tok_a), "x-nonce": nonce},
    )
    assert res.status_code == 200
    att = res.json()
    assert att["id"] > 0
    assert att["filename"] == "report.docx"
    assert att["nonce"] == nonce

    # Send message with attachment
    res = client.post(
        f"/chats/{chat_id}/messages",
        json={"content": None, "content_type": "file", "attachment_id": att["id"]},
        headers=auth_headers(tok_a),
    )
    assert res.status_code == 200
    msg = res.json()
    assert msg["attachment"]["id"] == att["id"]
    assert msg["attachment"]["filename"] == "report.docx"

    # Download the attachment as Bob
    res = client.get(f"/files/{att['id']}", headers=auth_headers(tok_b))
    assert res.status_code == 200
    # Ensure headers present
    assert res.headers.get("x-nonce")
    assert res.headers.get("x-algo") == "AES-GCM"
    cd = res.headers.get("content-disposition", "")
    assert "attachment;" in cd
    assert "filename*=" in cd
    assert res.content  # some bytes


