from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


class NotFound(Exception):
    pass


class Repository:
    def __init__(self, path: Path, session_ttl_hours: int = 24):
        self.path = path
        self.session_ttl_hours = session_ttl_hours
        self.lock = threading.Lock()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS workflows (
                    analysis_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, data_json TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS audit (
                    event_id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, session_id TEXT NOT NULL,
                    created_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, step TEXT NOT NULL,
                    field_id TEXT, previous_json TEXT, new_json TEXT
                );
                CREATE INDEX IF NOT EXISTS workflow_owner ON workflows(session_id, analysis_id);
                CREATE INDEX IF NOT EXISTS audit_owner ON audit(session_id, analysis_id, created_at);
            """)

    def create_session(self) -> tuple[str, datetime]:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(UTC) + timedelta(hours=self.session_ttl_hours)
        with self.lock, self.connect() as connection:
            expired = [row["id"] for row in connection.execute("SELECT id FROM sessions WHERE expires_at <= ?", (datetime.now(UTC).isoformat(),)).fetchall()]
            for session_id in expired:
                connection.execute("DELETE FROM audit WHERE session_id = ?", (session_id,))
                connection.execute("DELETE FROM workflows WHERE session_id = ?", (session_id,))
                connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            connection.execute("INSERT INTO sessions VALUES (?, ?, ?)", (str(uuid.uuid4()), self._hash(token), expires.isoformat()))
        return token, expires

    def session_id(self, token: str) -> str | None:
        with self.connect() as connection:
            row = connection.execute("SELECT id, expires_at FROM sessions WHERE token_hash = ?", (self._hash(token),)).fetchone()
        if not row or datetime.fromisoformat(row["expires_at"]) <= datetime.now(UTC):
            return None
        return str(row["id"])

    def create_workflow(self, session_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(UTC).isoformat()
        with self.lock, self.connect() as connection:
            connection.execute(
                "INSERT INTO workflows VALUES (?, ?, ?, ?, ?)",
                (data["analysis_id"], session_id, json.dumps(data, ensure_ascii=False, default=str), now, now),
            )
        return data

    def get_workflow(self, session_id: str, analysis_id: str) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute("SELECT data_json FROM workflows WHERE session_id = ? AND analysis_id = ?", (session_id, analysis_id)).fetchone()
        if not row:
            raise NotFound
        return json.loads(row["data_json"])

    def save_workflow(self, session_id: str, data: dict[str, Any]) -> None:
        now = datetime.now(UTC).isoformat()
        with self.lock, self.connect() as connection:
            cursor = connection.execute(
                "UPDATE workflows SET data_json = ?, updated_at = ? WHERE session_id = ? AND analysis_id = ?",
                (json.dumps(data, ensure_ascii=False, default=str), now, session_id, data["analysis_id"]),
            )
            if cursor.rowcount != 1:
                raise NotFound

    def updated_at(self, session_id: str, analysis_id: str) -> datetime:
        with self.connect() as connection:
            row = connection.execute("SELECT updated_at FROM workflows WHERE session_id = ? AND analysis_id = ?", (session_id, analysis_id)).fetchone()
        if not row:
            raise NotFound
        return datetime.fromisoformat(row["updated_at"])

    def add_audit(self, session_id: str, analysis_id: str, actor: str, action: str, step: str, field_id: str | None, previous: Any, new: Any) -> None:
        with self.lock, self.connect() as connection:
            connection.execute(
                "INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), analysis_id, session_id, datetime.now(UTC).isoformat(), actor, action, step, field_id,
                 json.dumps(previous, ensure_ascii=False, default=str), json.dumps(new, ensure_ascii=False, default=str)),
            )

    def audit(self, session_id: str, analysis_id: str) -> list[dict[str, Any]]:
        self.get_workflow(session_id, analysis_id)
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM audit WHERE session_id = ? AND analysis_id = ? ORDER BY created_at, event_id", (session_id, analysis_id)
            ).fetchall()
        descriptions = {
            "field_updated": "Вы изменили поле.", "field_confirmed": "Вы подтвердили поле.",
            "document_analyzed": "Документ проанализирован. Проверьте предложенные значения.",
            "workflow_created": "Создан черновик.", "validation_requested": "Выполнена проверка черновика.",
            "draft_saved": "Черновик сохранён.", "demo_started": "Запущен синтетический демонстрационный сценарий.",
        }
        return [{
            "event_id": row["event_id"], "analysis_id": row["analysis_id"], "timestamp": row["created_at"],
            "actor": row["actor"], "action": row["action"], "step": row["step"], "field_id": row["field_id"],
            "previous_value": json.loads(row["previous_json"]), "new_value": json.loads(row["new_json"]),
            "description": descriptions.get(row["action"], "Действие записано в журнал."),
        } for row in rows]

    @staticmethod
    def _hash(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()
