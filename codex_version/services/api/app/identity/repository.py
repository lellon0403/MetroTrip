from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.identity.models import PasswordResetChallenge, RefreshSession, User


class IdentityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email.lower()))

    def get_user(self, user_id: UUID) -> User | None:
        return self.db.get(User, user_id)

    def add_user(self, user: User) -> None:
        self.db.add(user)

    def get_refresh_session_for_update(self, token_hash: str) -> RefreshSession | None:
        return self.db.scalar(
            select(RefreshSession).where(RefreshSession.token_hash == token_hash).with_for_update()
        )

    def add_refresh_session(self, session: RefreshSession) -> None:
        self.db.add(session)

    def revoke_family(self, family_id: UUID, reuse_detected: bool = False) -> None:
        now = datetime.now(UTC)
        values: dict[str, datetime] = {"revoked_at": now}
        if reuse_detected:
            values["reuse_detected_at"] = now
        self.db.execute(
            update(RefreshSession)
            .where(RefreshSession.family_id == family_id, RefreshSession.revoked_at.is_(None))
            .values(**values)
        )

    def revoke_user_sessions(self, user_id: UUID) -> None:
        self.db.execute(
            update(RefreshSession)
            .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    def add_reset_challenge(self, challenge: PasswordResetChallenge) -> None:
        self.db.add(challenge)

    def get_reset_challenge_for_update(
        self, email: str, code_hash: str
    ) -> PasswordResetChallenge | None:
        return self.db.scalar(
            select(PasswordResetChallenge)
            .where(
                PasswordResetChallenge.email == email.lower(),
                PasswordResetChallenge.code_hash == code_hash,
                PasswordResetChallenge.used_at.is_(None),
            )
            .order_by(PasswordResetChallenge.created_at.desc())
            .with_for_update()
        )
