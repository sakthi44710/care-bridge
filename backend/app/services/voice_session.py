"""In-memory voice session manager for WebSocket conversations."""
import uuid
from typing import Dict, List


class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, List] = {}

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = []
        return session_id

    def get_history(self, session_id: str) -> List:
        return self.sessions.get(session_id, [])

    def update_history(self, session_id: str, history: List):
        self.sessions[session_id] = history

    def end_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]


session_manager = SessionManager()
