from rest_framework import serializers

from apps.models import Assessment, Period, Schedule
from apps.services.assessments_service import (
    get_assessment_score_stats,
    resolve_component_for_template,
    resolve_grade_period_for_user,
    resolve_schedule_for_user,
    resolve_schedule_template_or_default,
    validate_assessment_title_unique,
)
from apps.services.setup_service import get_grade_period_queryset


class ScheduleGradingComponentSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    weight = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    order = serializers.IntegerField(read_only=True)


class AssessmentScoreEntrySerializer(serializers.Serializer):
    record = serializers.IntegerField(read_only=True)
    student = serializers.IntegerField(read_only=True)
    student_name = serializers.CharField(read_only=True)
    student_id = serializers.CharField(read_only=True)
    score = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        allow_null=True,
        read_only=True,
    )
    is_entered = serializers.BooleanField(read_only=True)


class AssessmentSerializer(serializers.ModelSerializer):
    grade_period = serializers.PrimaryKeyRelatedField(
        source="period",
        queryset=Period.objects.all(),
    )
    schedule_display = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="schedule.subject.name", read_only=True)
    subject_code = serializers.CharField(source="schedule.subject.code", read_only=True)
    section_name = serializers.CharField(source="schedule.section.name", read_only=True)
    grade_period_name = serializers.CharField(source="period.name", read_only=True)
    component_name = serializers.CharField(source="component.type", read_only=True)
    component_weight = serializers.DecimalField(
        source="component.weight",
        max_digits=5,
        decimal_places=2,
        read_only=True,
    )
    submitted_count = serializers.SerializerMethodField()
    average_score = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = [
            "id",
            "title",
            "description",
            "schedule",
            "schedule_display",
            "subject_name",
            "subject_code",
            "section_name",
            "grade_period",
            "grade_period_name",
            "component",
            "component_name",
            "component_weight",
            "max_score",
            "date_given",
            "is_active",
            "submitted_count",
            "average_score",
        ]
        read_only_fields = [
            "id",
            "schedule_display",
            "subject_name",
            "subject_code",
            "section_name",
            "grade_period_name",
            "component_name",
            "component_weight",
            "submitted_count",
            "average_score",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._score_stats_cache = {}
        request = self.context.get("request")
        if not request:
            return
        user = request.user
        self.fields["schedule"].queryset = Schedule.objects.filter(
            user=user,
            school_year_semester__school_year__user=user,
            school_year_semester__semester__user=user,
        ).order_by("day", "id")
        self.fields["grade_period"].queryset = get_grade_period_queryset(user).order_by(
            "position", "id"
        )

    def get_schedule_display(self, obj):
        return f"{obj.schedule.subject.name} - {obj.schedule.section.name} ({obj.schedule.day or '-'})"

    def get_submitted_count(self, obj):
        submitted_count, _avg = self._get_score_stats(obj)
        return submitted_count

    def get_average_score(self, obj):
        _count, avg = self._get_score_stats(obj)
        return avg

    def _get_score_stats(self, obj):
        cached = self._score_stats_cache.get(obj.id)
        if cached is not None:
            return cached
        stats = get_assessment_score_stats(obj)
        self._score_stats_cache[obj.id] = stats
        return stats

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            raise serializers.ValidationError("User context is required.")

        instance = self.instance
        title = str(attrs.get("title", instance.title if instance else "") or "").strip()
        description = str(
            attrs.get("description", instance.description if instance else "") or ""
        ).strip()
        schedule_value = attrs.get("schedule", instance.schedule if instance else None)
        grade_period_value = attrs.get("period", instance.period if instance else None)
        component_value = attrs.get("component", instance.component if instance else None)
        max_score = attrs.get("max_score", instance.max_score if instance else None)
        date_given = attrs.get("date_given", instance.date_given if instance else None)

        if not title:
            raise serializers.ValidationError({"title": "Assessment title is required."})
        if schedule_value is None:
            raise serializers.ValidationError({"schedule": "Please select a schedule."})
        if grade_period_value is None:
            raise serializers.ValidationError({"grade_period": "Please select a grade period."})
        if component_value is None:
            raise serializers.ValidationError(
                {"component": "Please select a grading component."}
            )
        if max_score is None:
            raise serializers.ValidationError({"max_score": "Total score is required."})
        if max_score <= 0:
            raise serializers.ValidationError(
                {"max_score": "Total score must be greater than 0."}
            )
        if date_given is None:
            raise serializers.ValidationError({"date_given": "Date given is required."})

        schedule = resolve_schedule_for_user(request.user, schedule_value, require_active=True)
        grade_period = resolve_grade_period_for_user(request.user, grade_period_value)
        template = resolve_schedule_template_or_default(request.user, schedule)
        component = resolve_component_for_template(component_value, template)
        validate_assessment_title_unique(
            schedule,
            grade_period,
            title,
            exclude_id=instance.id if instance else None,
        )

        attrs["title"] = title
        attrs["description"] = description or None
        attrs["schedule"] = schedule
        attrs["period"] = grade_period
        attrs["component"] = component
        attrs["type"] = component.type
        return attrs
