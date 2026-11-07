from __future__ import annotations

from typing import Annotated

from fastapi import Header, HTTPException, Request


def session_owner(request: Request, x_session_token: Annotated[str | None, Header(alias="X-Session-Token")] = None) -> str:
    if not x_session_token:
        raise HTTPException(401, {"code": "SESSION_REQUIRED", "message": "Передайте X-Session-Token."})
    session_id = request.app.state.repository.session_id(x_session_token)
    if not session_id:
        raise HTTPException(401, {"code": "SESSION_INVALID", "message": "Сессия недействительна или истекла."})
    return session_id
