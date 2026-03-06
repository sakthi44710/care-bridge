import uuid
from typing import Dict, List

class SessionManager:
    def __init__(self):
        # Maps session_id to a list of conversation history turns
        self.sessions: Dict[str, List] = {}

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = []
        return session_id

    def get_history(self, session_id: str) -> List:
        return self.sessions.get(session_id, [])

    def update_history(self, session_id: str, history: List):
        self.sessions[session_id] = history

    def add_to_history(self, session_id: str, message: dict):
        if session_id in self.sessions:
            self.sessions[session_id].append(message)

    def end_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]

session_manager = SessionManager()
