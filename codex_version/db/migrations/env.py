from logging.config import fileConfig

from alembic import context
from app.core.config import get_settings
from app.discovery import models as discovery_models  # noqa: F401
from app.identity import models as identity_models  # noqa: F401
from app.infrastructure.database import Base
from app.operations import models as operations_models  # noqa: F401
from app.planning import models as planning_models  # noqa: F401
from app.recruitments import models as recruitment_models  # noqa: F401
from app.reviews import models as review_models  # noqa: F401
from app.transit import models as transit_models  # noqa: F401
from sqlalchemy import engine_from_config, pool

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
