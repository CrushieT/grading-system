from rest_framework import serializers

from apps.models import GradingTemplate, GradingTemplateItem, Record
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


class ComputedGradeSerializer(serializers.Serializer):
    student = serializers.IntegerField(read_only=True)
    student_name = serializers.CharField(read_only=True)
    student_id = serializers.CharField(read_only=True)
    schedule = serializers.IntegerField(read_only=True)
    schedule_display = serializers.CharField(read_only=True)
    grade_period = serializers.IntegerField(read_only=True)
    grade_period_name = serializers.CharField(read_only=True)
    component_breakdown = serializers.ListField(child=serializers.DictField(), read_only=True)
    final_grade = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    remarks = serializers.CharField(read_only=True)
    computed_at = serializers.DateTimeField(read_only=True)


class RecordSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_id = serializers.CharField(source="student.student_id", read_only=True)
    schedule_display = serializers.SerializerMethodField()
    grade_period_name = serializers.CharField(source="grade_period.name", read_only=True)
    overall_average_grade = serializers.SerializerMethodField()
    overall_remarks = serializers.SerializerMethodField()

    class Meta:
        model = Record
        fields = [
            "id",
            "student",
            "student_name",
            "student_id",
            "schedule",
            "schedule_display",
            "grade_period",
            "grade_period_name",
            "component_breakdown",
            "final_grade",
            "remarks",
            "overall_average_grade",
            "overall_remarks",
            "computed_at",
            "is_locked",
        ]

    def get_student_name(self, obj):
        middle = f" {obj.student.middle_name.strip()}" if obj.student.middle_name else ""
        return f"{obj.student.first_name}{middle} {obj.student.last_name}".strip()

    def get_schedule_display(self, obj):
        return f"{obj.schedule.subject.name} - {obj.schedule.section.name}"

    def get_overall_average_grade(self, obj):
        overall_map = self.context.get("overall_map") or {}
        item = overall_map.get(obj.student_id)
        return None if item is None else item.get("overall_average_grade")

    def get_overall_remarks(self, obj):
        overall_map = self.context.get("overall_map") or {}
        item = overall_map.get(obj.student_id)
        return None if item is None else item.get("overall_remarks")
