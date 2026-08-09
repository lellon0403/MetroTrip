"""Versioned API router composition."""

from fastapi import APIRouter

from app.routers.auth import router as auth_router
from app.routers.community import admin_router as admin_post_router
from app.routers.community import router as community_router
from app.routers.notices import admin_router as admin_notice_router
from app.routers.notices import router as notice_router
from app.routers.plans import router as plan_router
from app.routers.plans import shared_router as shared_plan_router
from app.routers.reviews import admin_router as admin_review_router
from app.routers.reviews import media_router as review_media_router
from app.routers.reviews import router as review_router
from app.routers.transit import admin_router as admin_place_router
from app.routers.transit import router as transit_router
from app.routers.users import router as user_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(transit_router)
api_router.include_router(plan_router)
api_router.include_router(shared_plan_router)
api_router.include_router(review_router)
api_router.include_router(review_media_router)
api_router.include_router(notice_router)
api_router.include_router(community_router)
api_router.include_router(admin_notice_router)
api_router.include_router(admin_place_router)
api_router.include_router(admin_review_router)
api_router.include_router(admin_post_router)
