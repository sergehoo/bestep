from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from urllib.parse import urlparse

from django.conf import settings
from django.utils.module_loading import import_string

SUPPORTED_PROVIDERS = {"stripe", "paydunya", "cinetpay"}


class CheckoutProviderUnavailable(RuntimeError):
    pass


class CheckoutProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class CheckoutSession:
    provider: str
    reference: str
    checkout_url: str


def checkout_provider_is_configured() -> bool:
    return bool(getattr(settings, "COMMERCE_CHECKOUT_SESSION_FACTORY", "").strip())


def create_checkout_session(*, order, request) -> CheckoutSession:
    factory_path = getattr(settings, "COMMERCE_CHECKOUT_SESSION_FACTORY", "").strip()
    if not factory_path:
        raise CheckoutProviderUnavailable("Aucun prestataire de paiement n'est configuré.")

    try:
        factory = import_string(factory_path)
        result = factory(order=order, request=request)
    except CheckoutProviderUnavailable:
        raise
    except Exception as exc:
        raise CheckoutProviderError("Le prestataire de paiement est indisponible.") from exc

    if not isinstance(result, Mapping):
        raise CheckoutProviderError("Réponse invalide du prestataire de paiement.")

    provider = (
        str(result.get("provider") or getattr(settings, "COMMERCE_CHECKOUT_PROVIDER", ""))
        .lower()
        .strip()
    )
    reference = str(result.get("reference") or "").strip()
    checkout_url = str(result.get("checkout_url") or "").strip()

    if provider not in SUPPORTED_PROVIDERS or not reference:
        raise CheckoutProviderError("Référence de paiement invalide.")

    parsed_url = urlparse(checkout_url)
    allowed_schemes = {"https"}
    if settings.DEBUG:
        allowed_schemes.add("http")
    if parsed_url.scheme not in allowed_schemes or not parsed_url.netloc:
        raise CheckoutProviderError("URL de paiement invalide.")

    return CheckoutSession(
        provider=provider,
        reference=reference,
        checkout_url=checkout_url,
    )
