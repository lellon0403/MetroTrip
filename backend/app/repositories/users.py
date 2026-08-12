"""회원 정보와 역 즐겨찾기 관리."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.transit import Station
from app.models.users import StationFavorite


class UserRepository:
    """회원 정보 관련 SQLAlchemy 작업을 담당한다."""

    def __init__(self, session: Session) -> None:
        """DB 세션을 저장한다."""
        self.session = session

    def find_user_by_id(self, user_id: int) -> User | None:
        """아이디로 사용자를 조회한다."""
        return self.session.get(User, user_id)

    def find_user_by_nickname(self, nickname: str) -> User | None:
        """닉네임으로 사용자를 조회한다."""
        return self.session.scalar(select(User).where(User.nickname == nickname))

    def update_profile(
        self,
        user: User,
        *,
        name: str | None = None,
        nickname: str | None = None,
    ) -> None:
        """전달된 이름과 닉네임만 사용자 모델에 반영한다."""
        if name is not None:
            user.name = name
        if nickname is not None:
            user.nickname = nickname

    def update_password(self, user: User, password: str) -> None:
        """해시된 새 비밀번호를 사용자 모델에 반영한다."""
        user.password = password

    def delete_user(self, user: User) -> None:
        """사용자 모델을 삭제 대상으로 등록해 DB 연쇄 삭제를 시작한다."""
        self.session.delete(user)

    def find_station_by_id(self, station_id: int) -> Station | None:
        """역 ID에 해당하는 역을 조회한다."""
        return self.session.get(Station, station_id)

    def list_favorites(
        self,
        user_id: int,
    ) -> list[tuple[StationFavorite, str]]:
        """사용자의 역 즐겨찾기를 최근 추가순으로 조회한다."""
        statement = (
            select(StationFavorite, Station.station_name)
            .join(Station, Station.station_id == StationFavorite.station_id)
            .where(StationFavorite.user_id == user_id)
            .order_by(
                StationFavorite.created_at.desc(),
                StationFavorite.favorite_id.desc(),
            )
        )
        return list(self.session.execute(statement).tuples())

    def find_favorite(
        self,
        user_id: int,
        station_id: int,
    ) -> StationFavorite | None:
        """사용자와 역에 해당하는 즐겨찾기를 조회한다."""
        return self.session.scalar(
            select(StationFavorite).where(
                StationFavorite.user_id == user_id,
                StationFavorite.station_id == station_id,
            )
        )

    def create_favorite(
        self,
        user_id: int,
        station_id: int,
    ) -> StationFavorite:
        """새 역 즐겨찾기를 추가하고 DB 기본값을 포함한 결과를 반환한다."""
        favorite = StationFavorite(
            user_id=user_id,
            station_id=station_id,
        )
        self.session.add(favorite)
        self.session.flush()
        self.session.refresh(favorite)
        return favorite

    def delete_favorite(self, user_id: int, station_id: int) -> None:
        """사용자와 역에 해당하는 즐겨찾기를 존재 여부와 무관하게 삭제한다."""
        self.session.execute(
            delete(StationFavorite).where(
                StationFavorite.user_id == user_id,
                StationFavorite.station_id == station_id,
            )
        )
