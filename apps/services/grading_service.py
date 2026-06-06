from decimal import Decimal, InvalidOperation

from django.db.models import Prefetch, Q
from rest_framework import serializers

from apps.models import GradingTemplate, GradingTemplateItem, Schedule


HUNDRED = Decimal("100.00")


def _to_bool_param(value):
    if value is None:
        return None
    parsed = str(value).strip().lower()
    if parsed in {"1", "true", "yes", "y"}:
        return True
    if parsed in {"0", "false", "no", "n"}:
        return False
    raise serializers.ValidationError("Value must be true or false.")


def get_grading_template_queryset(user):
    return GradingTemplate.objects.filter(user=user).prefetch_related(
        Prefetch(
            "gradingtemplateitem_set",
            queryset=GradingTemplateItem.objects.order_by("order", "id"),
        )
    )


def get_active_default_template(user):
    return (
        GradingTemplate.objects.filter(user=user, is_default=True, is_active=True)
        .order_by("id")
        .first()
    )


def apply_grading_template_filters(queryset, params):
    search = (params.get("search") or "").strip()
    is_active = params.get("is_active")
    is_default = params.get("is_default")

    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(description__icontains=search)
            | Q(gradingtemplateitem__type__icontains=search)
        ).distinct()

    if is_active is not None and str(is_active).strip() != "":
        queryset = queryset.filter(is_active=_to_bool_param(is_active))

    if is_default is not None and str(is_default).strip() != "":
        queryset = queryset.filter(is_default=_to_bool_param(is_default))

    return queryset


def validate_template_name_unique(user, name, exclude_id=None):
    queryset = GradingTemplate.objects.filter(user=user, name__iexact=name.strip())
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError({"name": "A grading template with this name already exists."})


def _parse_weight(raw_weight):
    try:
        weight = Decimal(str(raw_weight))
    except (InvalidOperation, TypeError, ValueError):
        raise serializers.ValidationError({"components": "Component weight must be a valid number."})
    return weight.quantize(Decimal("0.01"))


def normalize_template_components(raw_components):
    if not isinstance(raw_components, list) or not raw_components:
        raise serializers.ValidationError({"components": "Please add at least one component."})

    normalized = []
    seen_names = set()
    active_total = Decimal("0.00")

    for index, item in enumerate(raw_components):
        if not isinstance(item, dict):
            raise serializers.ValidationError({"components": "Each component must be an object."})

        raw_name = item.get("name", item.get("type", ""))
        name = " ".join(str(raw_name or "").strip().split())
        if not name:
            raise serializers.ValidationError({"components": "Component name is required."})

        lowered_name = name.lower()
        if lowered_name in seen_names:
            raise serializers.ValidationError({"components": "Duplicate component names are not allowed."})
        seen_names.add(lowered_name)

        weight = _parse_weight(item.get("weight"))
        if weight <= 0:
            raise serializers.ValidationError({"components": "Component weight must be greater than 0."})
        if weight > HUNDRED:
            raise serializers.ValidationError({"components": "Component weight must not exceed 100."})

        raw_order = item.get("order", index + 1)
        try:
            order = int(raw_order)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"components": "Component order must be a whole number."})
        if order <= 0:
            raise serializers.ValidationError({"components": "Component order must be greater than 0."})

        is_active = bool(item.get("is_active", True))
        if is_active:
            active_total += weight

        normalized.append(
            {
                "type": name,
                "weight": weight,
                "order": order,
                "is_active": is_active,
            }
        )

    if active_total != HUNDRED:
        raise serializers.ValidationError({"components": "Total weight must equal 100%."})

    return normalized


def replace_template_components(template, components):
    GradingTemplateItem.objects.filter(grading_template=template).delete()
    GradingTemplateItem.objects.bulk_create(
        [GradingTemplateItem(grading_template=template, **item) for item in components]
    )


def set_default_template(template):
    GradingTemplate.objects.filter(user=template.user).exclude(id=template.id).update(is_default=False)
    if not template.is_active:
        template.is_active = True
    template.is_default = True
    template.save(update_fields=["is_default", "is_active"])
    return template


def deactivate_template(template):
    was_default = template.is_default
    template.is_active = False
    template.is_default = False
    template.save(update_fields=["is_active", "is_default"])

    if was_default:
        replacement = (
            GradingTemplate.objects.filter(user=template.user, is_active=True)
            .exclude(id=template.id)
            .order_by("id")
            .first()
        )
        if replacement is not None:
            set_default_template(replacement)


def delete_or_deactivate_template(template):
    if Schedule.objects.filter(grading_template=template).exists():
        deactivate_template(template)
        return "deactivated"
    template.delete()
    return "deleted"
