from rest_framework import serializers

from apps.models import GradingTemplate, GradingTemplateItem
from apps.services.grading_service import (
    normalize_template_components,
    replace_template_components,
    set_default_template,
    validate_template_name_unique,
)


class GradingTemplateItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="type")

    class Meta:
        model = GradingTemplateItem
        fields = ["id", "name", "weight", "order", "is_active"]
        read_only_fields = ["id"]


class GradingTemplateSerializer(serializers.ModelSerializer):
    components = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        write_only=True,
    )
    components_summary = serializers.SerializerMethodField()

    class Meta:
        model = GradingTemplate
        fields = [
            "id",
            "name",
            "description",
            "is_default",
            "is_active",
            "components",
            "components_summary",
        ]
        read_only_fields = ["id", "is_default", "components_summary"]

    def _ordered_components(self, instance):
        prefetched = getattr(instance, "_prefetched_objects_cache", {})
        if "gradingtemplateitem_set" in prefetched:
            return prefetched["gradingtemplateitem_set"]
        return instance.gradingtemplateitem_set.order_by("order", "id")

    def get_components_summary(self, instance):
        parts = []
        for item in self._ordered_components(instance):
            if not item.is_active:
                continue
            parts.append(f"{item.type} {item.weight}%")
        return " | ".join(parts)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["components"] = GradingTemplateItemSerializer(
            self._ordered_components(instance),
            many=True,
        ).data
        return data

    def validate(self, attrs):
        request = self.context.get("request")
        if request is None:
            raise serializers.ValidationError("User context is required.")

        instance = self.instance
        name = str(attrs.get("name", instance.name if instance else "") or "").strip()
        if not name:
            raise serializers.ValidationError({"name": "Template name is required."})

        validate_template_name_unique(
            user=request.user,
            name=name,
            exclude_id=instance.id if instance else None,
        )
        attrs["name"] = name

        description = attrs.get("description", instance.description if instance else None)
        attrs["description"] = str(description or "").strip() or None

        raw_components = attrs.get("components")
        if raw_components is None:
            raw_components = self.initial_data.get("components")

        if raw_components is None and instance is None:
            raise serializers.ValidationError(
                {"components": "Please add at least one component."}
            )

        if raw_components is not None:
            attrs["_normalized_components"] = normalize_template_components(raw_components)

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        normalized_components = validated_data.pop("_normalized_components", [])
        validated_data.pop("components", None)

        template = GradingTemplate.objects.create(
            user=request.user,
            **validated_data,
        )
        replace_template_components(template, normalized_components)

        if not GradingTemplate.objects.filter(
            user=request.user,
            is_default=True,
            is_active=True,
        ).exists():
            set_default_template(template)

        return template

    def update(self, instance, validated_data):
        normalized_components = validated_data.pop("_normalized_components", None)
        validated_data.pop("components", None)

        for field in ("name", "description", "is_active"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])

        if "is_active" in validated_data and not validated_data["is_active"]:
            instance.is_default = False

        instance.save()

        if normalized_components is not None:
            replace_template_components(instance, normalized_components)

        if not GradingTemplate.objects.filter(
            user=instance.user,
            is_default=True,
            is_active=True,
        ).exists():
            fallback = (
                GradingTemplate.objects.filter(user=instance.user, is_active=True)
                .order_by("id")
                .first()
            )
            if fallback is not None:
                set_default_template(fallback)

        return instance
