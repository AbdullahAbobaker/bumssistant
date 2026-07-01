"""Authentication.

Production: validate a Microsoft Entra ID (Azure AD) access token.
Local dev: DEV_AUTH_BYPASS returns a fake user so you can work from a private
laptop with no corporate tenant. The bypass refuses to run in production.
"""
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


@dataclass
class CurrentUser:
    entra_oid: str
    email: str
    display_name: str


async def get_current_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if settings.dev_auth_bypass:
        if settings.is_production:
            # Fail closed: never allow the bypass in production.
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "DEV_AUTH_BYPASS must be false in production.",
            )
        return CurrentUser(
            entra_oid="dev-local-user",
            email=settings.dev_user_email,
            display_name=settings.dev_user_name,
        )

    # TODO(entra): validate the Bearer token against Entra ID JWKS, then map
    # the token's `oid`/`preferred_username` onto CurrentUser. Stubbed for now.
    if not authorization:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token.")
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Entra token validation not wired yet.")
