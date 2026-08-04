"""이메일 발송 연동."""

import logging
import smtplib
from email.message import EmailMessage

from app.config import Settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """이메일을 발송하지 못했을 때 발생한다."""


class EmailSender:
    """콘솔 또는 SMTP로 인증 코드를 발송한다."""

    def __init__(self, settings: Settings) -> None:
        """이메일 발송 설정을 저장한다."""
        self.settings = settings

    def send_verification_code(self, recipient: str, code: str) -> None:
        """수신자에게 이메일 인증 코드를 발송한다."""
        if self.settings.email_mode == "console":
            logger.warning(
                "[MetroTrip] 이메일 인증 코드 recipient=%s code=%s",
                recipient,
                code,
            )
            return

        if not all(
            (
                self.settings.smtp_host,
                self.settings.smtp_username,
                self.settings.smtp_password,
                self.settings.smtp_from,
            )
        ):
            raise EmailDeliveryError("이메일 발송 설정이 없습니다.")

        message = EmailMessage()
        message["Subject"] = "MetroTrip 이메일 인증 코드"
        message["From"] = self.settings.smtp_from
        message["To"] = recipient
        message.set_content(
            f"MetroTrip 인증 코드는 {code}입니다. "
            f"{self.settings.verification_code_expire_minutes}분 이내에 입력해주세요."
        )

        try:
            with smtplib.SMTP(
                self.settings.smtp_host,
                self.settings.smtp_port,
            ) as smtp:
                if self.settings.smtp_use_tls:
                    smtp.starttls()
                smtp.login(
                    self.settings.smtp_username,
                    self.settings.smtp_password,
                )
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as error:
            raise EmailDeliveryError("이메일 발송에 실패했습니다.") from error
