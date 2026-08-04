"""General board and recruitment API contracts."""

from typing import Annotated
from fastapi import APIRouter, Query, status
from fastapi.responses import JSONResponse
from app.routers.contract import AUTH_REQUIRED, ERROR_RESPONSES, not_implemented
from app.schemas.community import (
    ParticipantCancelRequest,
    ParticipantDecisionRequest,
    ParticipantListResponse,
    ParticipantResponse,
    ParticipantStatus,
    PostCreateRequest,
    PostDetailResponse,
    PostListResponse,
    PostType,
    PostUpdateRequest,
    RecruitStatus,
)

# '/posts' 경로를 공통으로 가지며, Swagger에 "게시판" 태그로 묶이는 라우터 인스턴스를 생성
router = APIRouter(prefix="/posts", tags=["게시판"])

# 게시글 목록 조회
@router.get(
    "",
    response_model=PostListResponse,
    summary="게시글 목록 조회",
    description="일반 글과 인원 모집 글을 조회합니다. 좋아요와 정렬 옵션은 제외합니다.",
    responses=ERROR_RESPONSES,
)
# Annotated를 사용하여 Query 파라미터의 타입과 유효성 검사(max_length, ge, le) 조건을 정의
# 이를 통해 서비스 로직 실행 전 프레임워크 단에서 입력값 검증이 완료
def list_posts(
    post_type: Annotated[PostType | None, Query()] = None,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    recruit_status: Annotated[RecruitStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> JSONResponse:
    return not_implemented()

# 게시글 작성 
@router.post(
    "",
    response_model=PostDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="게시글 작성",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def create_post(_: PostCreateRequest) -> JSONResponse:
    return not_implemented()

# 게시글 상제 조회
@router.get(
    "/{post_id}",
    response_model=PostDetailResponse,
    summary="게시글 상세 조회",
    responses=ERROR_RESPONSES,
)
# URL 경로 변수로 post_id를 받아 특정 게시글의 식별자로 사용
def get_post(post_id: int) -> JSONResponse:
    return not_implemented()

# 게시글 수정
@router.patch(
    "/{post_id}",
    response_model=PostDetailResponse,
    summary="게시글 수정",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
# PUT 대신 PATCH를 사용하여 리소스의 부분 수정을 지원하는 RESTful 규칙을 따릅
def update_post(post_id: int, _: PostUpdateRequest) -> JSONResponse:
    return not_implemented()

# 게시글 삭제
@router.delete(
    "/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,     # 삭제 성공 시 바디 없음을 나타내는 204 코드를 반환
    summary="게시글 삭제",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
def delete_post(post_id: int) -> JSONResponse:
    return not_implemented()

# 모집 참여 신청
@router.post(
    "/{post_id}/participants",
    response_model=ParticipantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="모집 참여 신청",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
# 특정 게시글에 종속된 하위 리소스 생성 계층
def apply_to_post(post_id: int) -> JSONResponse:
    return not_implemented()

# 내 참여 신청 취소
@router.patch(
    "/{post_id}/participants/me",
    response_model=ParticipantResponse,
    summary="내 참여 신청 취소",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
# 상태도 관점에서 참여자의 상태를 '신청됨'에서 '취소됨'으로 전이시킴.
def cancel_my_application(
    post_id: int,
    _: ParticipantCancelRequest,
) -> JSONResponse:
    return not_implemented()

# 참여 신청 목록 조회
@router.get(
    "/{post_id}/participants",
    response_model=ParticipantListResponse,
    summary="참여 신청 목록 조회",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
# alias를 사용하여 파이썬 변수명과 실제 API URL의 Query 키워드를 다르게 매핑
def list_participants(
    post_id: int,
    participant_status: Annotated[
        ParticipantStatus | None,
        Query(alias="status"),
    ] = None,
) -> JSONResponse:
    return not_implemented()

# 참여 신청 수락 또는 거절
@router.patch(
    "/{post_id}/participants/{participant_id}",
    response_model=ParticipantResponse,
    summary="참여 신청 수락 또는 거절",
    dependencies=AUTH_REQUIRED,
    responses=ERROR_RESPONSES,
)
# 사용자가 작성한 특정 참여자의 상태를 결정(수락/거절)을 함.
def decide_participant(
    post_id: int,
    participant_id: int,
    _: ParticipantDecisionRequest,
) -> JSONResponse:
    return not_implemented()