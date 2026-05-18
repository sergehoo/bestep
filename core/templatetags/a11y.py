"""core/templatetags/a11y.py — Helpers accessibilité V5.F.

CORRECTIFS audit A11Y-08, A11Y-09 :

- A11Y-08 : 193 ``<label>`` sans ``for=`` dans les templates → lecteurs
  d'écran ne savent pas relier label/input, clic sur label ne focus pas.
- A11Y-09 : 1 seule occurrence d'``autocomplete=`` → password managers
  ne peuvent pas remplir.

Usage côté template :

    {% load a11y %}
    {% labeled_field form.email autocomplete="email" %}
    {% labeled_field form.password autocomplete="current-password" %}
    {% labeled_field form.phone autocomplete="tel" required=True %}

Le tag :
- ajoute automatiquement un ``id`` à l'input s'il n'en a pas,
- ajoute ``for=`` au label correspondant,
- pose ``autocomplete`` selon l'argument (ou pas si non fourni),
- pose ``aria-required`` / ``aria-invalid`` selon l'état du form,
- affiche l'aide et les erreurs en ``aria-describedby``.

Toutes les attentes WCAG 1.3.1, 1.3.5, 3.3.2.
"""
from __future__ import annotations

from django import template
from django.utils.html import format_html, format_html_join
from django.utils.safestring import mark_safe

register = template.Library()


_AUTOCOMPLETE_BY_NAME = {
    # Mappage par défaut quand l'appelant ne passe pas autocomplete=...
    "email": "email",
    "password": "current-password",
    "password1": "new-password",
    "password2": "new-password",
    "first_name": "given-name",
    "last_name": "family-name",
    "full_name": "name",
    "phone": "tel",
    "address": "street-address",
    "city": "address-level2",
    "country": "country-name",
    "postal_code": "postal-code",
}


@register.simple_tag
def labeled_field(bound_field, *, autocomplete=None, required=None, help_text=None, css_class=None):
    """Rend un champ avec son label, autocomplete, ARIA et erreurs.

    Args:
        bound_field: ``form["nom"]`` (BoundField Django).
        autocomplete: valeur HTML ``autocomplete`` (sinon devinée par nom).
        required: surcharge required (sinon hérité du champ).
        help_text: surcharge du help_text (sinon hérité).
        css_class: classes Tailwind additionnelles sur l'input.
    """
    if bound_field is None:
        return ""

    name = bound_field.name
    field = bound_field.field
    widget = field.widget

    # ID stable.
    input_id = widget.attrs.get("id") or f"id_{name}"
    widget.attrs.setdefault("id", input_id)

    # autocomplete : explicite > mapping par nom > rien.
    if autocomplete is None:
        autocomplete = _AUTOCOMPLETE_BY_NAME.get(name)
    if autocomplete and "autocomplete" not in widget.attrs:
        widget.attrs["autocomplete"] = autocomplete

    # required.
    is_required = field.required if required is None else bool(required)
    if is_required:
        widget.attrs["required"] = "required"
        widget.attrs["aria-required"] = "true"

    # aria-invalid + describedby si erreurs.
    described_by_parts = []
    if bound_field.errors:
        err_id = f"{input_id}-err"
        widget.attrs["aria-invalid"] = "true"
        described_by_parts.append(err_id)
    if help_text or field.help_text:
        help_id = f"{input_id}-help"
        described_by_parts.append(help_id)
    if described_by_parts:
        widget.attrs["aria-describedby"] = " ".join(described_by_parts)

    # CSS class additionnelle.
    if css_class:
        existing = widget.attrs.get("class", "")
        widget.attrs["class"] = f"{existing} {css_class}".strip()

    # Rendu.
    label_html = format_html(
        '<label for="{id}" class="label">{label}{req}</label>',
        id=input_id,
        label=bound_field.label,
        req=mark_safe(' <span class="text-rose-600" aria-hidden="true">*</span>') if is_required else "",
    )
    input_html = bound_field.as_widget()

    help_html = ""
    actual_help = help_text or field.help_text
    if actual_help:
        help_html = format_html(
            '<p id="{id}-help" class="text-xs text-slate-500 mt-1">{txt}</p>',
            id=input_id, txt=actual_help,
        )

    errors_html = ""
    if bound_field.errors:
        errors_html = format_html(
            '<ul id="{id}-err" class="text-xs text-rose-600 mt-1 space-y-0.5" role="alert">{items}</ul>',
            id=input_id,
            items=format_html_join("", "<li>{}</li>", ((e,) for e in bound_field.errors)),
        )

    return format_html(
        '<div class="space-y-1">{label}{input}{help}{errors}</div>',
        label=label_html, input=input_html, help=mark_safe(help_html), errors=mark_safe(errors_html),
    )


@register.simple_tag
def aria_describedby(*ids):
    """Helper inline pour construire un attribut aria-describedby."""
    return mark_safe(" ".join(i for i in ids if i))


@register.filter
def getattribute(obj, attr):
    """Filtre helper pour les templates qui ont besoin de lire un attr
    dynamique (utilisé par partials/filter_bar.html).
    """
    if obj is None:
        return ""
    if isinstance(obj, dict):
        return obj.get(attr, "")
    return getattr(obj, attr, "")
