from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from app.config import get_settings


# SQLAlchemy 2.0 스타일의 선언적 모델 클래스
# 앞으로 정의될 모든 DB 테이블 모델은 이 클래스를 상속받아 구현한다.
class Base(DeclarativeBase):
    pass

# 애플리케이션 설정을 불러옴
settings = get_settings()

# 데이터베이스와 통신하기 위한 Engine 객체 생성
# pool_pre_ping=True: DB 커넥션 풀에서 연결을 가져올 때 유효성을 먼저 확인하여, 
# 끊어진 연결로 인한 오류를 방지함.
engine = create_engine(settings.database_url, pool_pre_ping=True)

# 실제 데이터베이스 트랜잭션 작업을 수행하는 Session을 생성함.
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,            # 명시적으로 commit()이나 flush()를 호출하기 전까지 DB에 쿼리를 보내지 않아 제어권을 높임
    expire_on_commit=False,     # 커밋 후에도 객체 속성을 유지하여, 세션이 닫힌 밖에서도 데이터를 읽을 수 있게 함.
)

# FastAPI의 라우터 의존성 주입을 위한 함수
# API 요청마다 새로운 데이터베이스 세션을 생성하고,
# 처리가 끝나면(성공이든 예외 발생이든) finally 블록을 통해 세션을 안전하게 닫아 누수를 방지
def get_db() -> Generator[Session, None, None]:
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
