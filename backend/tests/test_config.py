from app.config import Settings


def test_ssl_ca_path_uses_metrotrip_prefix(monkeypatch):
    monkeypatch.setenv("METROTRIP_SSL_CA_PATH", "/run/certs/mysql/ca.pem")

    settings = Settings(database_url="sqlite://", _env_file=None)

    assert settings.ssl_ca_path == "/run/certs/mysql/ca.pem"
