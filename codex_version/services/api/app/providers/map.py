from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class MapConfiguration:
    provider: str
    mode: str
    interactive: bool
    attribution: str


class MapProvider(Protocol):
    def configuration(self) -> MapConfiguration: ...


class DevelopmentMapProvider:
    def configuration(self) -> MapConfiguration:
        return MapConfiguration(
            provider="development-map",
            mode="MOCKED",
            interactive=False,
            attribution="Geographic layout is illustrative fixture data.",
        )


class KakaoMapProvider:
    def configuration(self) -> MapConfiguration:
        return MapConfiguration(
            provider="kakao-map",
            mode="REAL",
            interactive=True,
            attribution="Kakao Map",
        )
