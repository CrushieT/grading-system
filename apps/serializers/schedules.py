from rest_framework import serializers

from apps.models import GradingTemplate, Period, Schedule, SchoolYearSemester, WeekDay
from apps.models.user import User
from apps.services.schedules_service import (
    get_schedule_period_queryset,
    get_grading_template_queryset_for_user,
    get_section_queryset_for_user,
    get_subject_queryset_for_user,
    validate_schedule_conflicts,
    validate_schedule_grading_template_owner,
    validate_schedule_period_owner,
    validate_schedule_school_year_sem_owner,
    validate_schedule_section_owner,
    validate_schedule_section_term_match,
    validate_schedule_subject_owner,
)
from apps.services.setup_service import ensure_schedule_term_is_active


class PeriodSlotSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=25)

    class Meta:
        model = Period
        fields = ["id", "name", "time_start", "time_end"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        instance = self.instance
        name = str(attrs.get("name", instance.name if instance else "") or "").strip()
        time_start = attrs.get("time_start", instance.time_start if instance else None)
        time_end = attrs.get("time_end", instance.time_end if instance else None)

        if not name:
            raise serializers.ValidationError({"name": "Period name is required."})
        if time_start is None:
            raise serializers.ValidationError({"time_start": "time_start is required."})
        if time_end is None:
            raise serializers.ValidationError({"time_end": "time_end is required."})
        if time_end <= time_start:
            raise serializers.ValidationError({"time_end": "End time must be after start time."})

        attrs["name"] = name
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if not request:
            raise serializers.ValidationError("User context is required.")
        return Period.objects.create(
            user=request.user,
            position=None,
            weight=0,
            is_active=True,
            **validated_data,
        )


class ScheduleSerializer(serializers.ModelSerializer):
    teacher = serializers.PrimaryKeyRelatedField(
        source="user",
        queryset=User.objects.all(),
        required=False,
    )
    school_year_sem = serializers.PrimaryKeyRelatedField(
        source="school_year_semester",
        queryset=SchoolYearSemester.objects.all(),
    )
    teacher_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    section_id = serializers.IntegerField(read_only=True)
    section_name = serializers.CharField(source="section.name", read_only=True)
    section_year_level = serializers.IntegerField(source="section.year_level", read_only=True)
    school_year_name = serializers.CharField(source="school_year_semester.school_year.name", read_only=True)
    semester_name = serializers.CharField(source="school_year_semester.semester.name", read_only=True)
    period_name = serializers.CharField(source="period.name", read_only=True)
    period_time = serializers.SerializerMethodField()
    school_year_sem_display = serializers.SerializerMethodField()
    period_display = serializers.SerializerMethodField()
    grading_template = serializers.PrimaryKeyRelatedField(
        required=False,
        allow_null=True,
        queryset=GradingTemplate.objects.none(),
    )
    grading_template_name = serializers.CharField(source="grading_template.name", read_only=True)

    class Meta:
        model = Schedule
        fields = [
            "id",
            "teacher",
            "teacher_name",
            "subject",
            "subject_name",
            "subject_code",
            "section",
            "section_id",
            "section_name",
            "section_year_level",
            "school_year_sem",
            "school_year_name",
            "semester_name",
            "school_year_sem_display",
            "day",
            "period",
            "period_name",
            "period_time",
            "period_display",
            "grading_template",
            "grading_template_name",
        ]
        read_only_fields = [
            "id",
            "teacher_name",
            "subject_name",
            "subject_code",
            "section_id",
            "section_name",
            "section_year_level",
            "school_year_name",
            "semester_name",
            "school_year_sem_display",
            "period_name",
            "period_time",
            "period_display",
            "grading_template_name",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if not request:
            return
        user = request.user
        self.fields["teacher"].queryset = User.objects.filter(id=user.id)
        self.fields["subject"].queryset = get_subject_queryset_for_user(user).order_by("code", "id")
        self.fields["section"].queryset = get_section_queryset_for_user(user).order_by("name", "id")
        self.fields["period"].queryset = get_schedule_period_queryset(user).order_by("time_start", "name")
        self.fields["grading_template"].queryset = get_grading_template_queryset_for_user(user).order_by(
            "name",
            "id",
        )
        self.fields["school_year_sem"].queryset = SchoolYearSemester.objects.select_related(
            "school_year",
            "semester",
        ).filter(
            school_year__user=user,
            semester__user=user,
        ).order_by("-is_active", "school_year__id", "semester__id")

    def get_teacher_name(self, obj):
        full_name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full_name or obj.user.username

    def get_period_time(self, obj):
        if not obj.period_id or obj.period.time_start is None or obj.period.time_end is None:
            return ""
        start = obj.period.time_start.strftime("%H:%M")
        end = obj.period.time_end.strftime("%H:%M")
        return f"{start}-{end}"

    def get_school_year_sem_display(self, obj):
        return obj.school_year_semester.school_year.name

    def get_period_display(self, obj):
        if not obj.period_id:
            return "-"
        period_time = self.get_period_time(obj)
        if period_time:
            return f"{obj.period.name} ({period_time})"
        return obj.period.name

    def validate_day(self, value):
        valid_days = {choice.value for choice in WeekDay}
        if value not in valid_days:
            raise serializers.ValidationError("Please select a day.")
        return value

    def validate(self, attrs):
        instance = self.instance
        request = self.context.get("request")
        if request is None:
            raise serializers.ValidationError("User context is required.")
        if instance is not None:
            ensure_schedule_term_is_active(instance)

        teacher = attrs.get("user") or (instance.user if instance else request.user)
        subject = attrs.get("subject") or (instance.subject if instance else None)
        section = attrs.get("section") or (instance.section if instance else None)
        school_year_semester = attrs.get("school_year_semester") or (
            instance.school_year_semester if instance else None
        )
        day = attrs.get("day") or (instance.day if instance else None)
        period = attrs.get("period") or (instance.period if instance else None)
        grading_template = attrs.get(
            "grading_template",
            instance.grading_template if instance else None,
        )

        if subject is None:
            raise serializers.ValidationError({"subject": "Please select a subject."})
        if section is None:
            raise serializers.ValidationError({"section": "Please select a section."})
        if school_year_semester is None:
            raise serializers.ValidationError(
                {"school_year_sem": "Please select a school term."}
            )
        if not school_year_semester.is_active:
            raise serializers.ValidationError(
                {"school_year_sem": "This school term is inactive and cannot be modified."}
            )
        if not day:
            raise serializers.ValidationError({"day": "Please select a day."})
        if period is None:
            raise serializers.ValidationError({"period": "Please select a period."})
        if grading_template is None:
            raise serializers.ValidationError(
                {"grading_template": "Please select an active grading template."}
            )

        validate_schedule_subject_owner(request.user, subject)
        validate_schedule_section_owner(request.user, section)
        validate_schedule_school_year_sem_owner(request.user, school_year_semester)
        validate_schedule_period_owner(request.user, period)
        validate_schedule_section_term_match(section, school_year_semester)

        if grading_template is not None:
            validate_schedule_grading_template_owner(request.user, grading_template)

        validate_schedule_conflicts(
            teacher=teacher,
            section=section,
            subject=subject,
            school_year_semester=school_year_semester,
            period=period,
            day=day,
            exclude_id=instance.id if instance else None,
        )

        attrs["user"] = teacher or request.user
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if "user" not in validated_data:
            validated_data["user"] = request.user
        return Schedule.objects.create(**validated_data)
