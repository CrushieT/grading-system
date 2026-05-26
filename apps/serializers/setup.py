from decimal import Decimal

from rest_framework import serializers

from apps.models import Period, SchoolYear, SchoolYearSemester, Semester
from apps.services.setup_service import (
    activate_grade_period,
    deactivate_school_year,
    activate_school_year,
    activate_school_year_semester,
    build_school_year_name,
    get_grade_period_queryset,
    get_default_school_year_for_user,
    get_school_year_is_active,
    get_semester_active_link,
    parse_school_year_name,
    validate_period_position_unique,
    validate_period_total_weight,
)


class SchoolYearSerializer(serializers.ModelSerializer):
    year_start = serializers.IntegerField(
        min_value=2000,
        max_value=2100,
        required=False,
        write_only=True,
    )
    year_end = serializers.IntegerField(
        min_value=2001,
        max_value=2101,
        required=False,
        write_only=True,
    )
    set_active = serializers.BooleanField(required=False, default=False, write_only=True)
    active_semester_id = serializers.IntegerField(required=False, write_only=True, min_value=1)
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = SchoolYear
        fields = [
            "id",
            "name",
            "year_start",
            "year_end",
            "is_active",
            "set_active",
            "active_semester_id",
        ]
        read_only_fields = ["id", "name", "is_active"]

    def get_is_active(self, obj):
        return get_school_year_is_active(obj)

    def validate(self, attrs):
        year_start = attrs.get("year_start")
        year_end = attrs.get("year_end")

        if self.instance is None and (year_start is None or year_end is None):
            raise serializers.ValidationError(
                {
                    "year_start": "This field is required.",
                    "year_end": "This field is required.",
                }
            )

        if (year_start is None) != (year_end is None):
            raise serializers.ValidationError(
                "Both year_start and year_end are required together."
            )

        if year_start is not None and year_end is not None and year_end <= year_start:
            raise serializers.ValidationError(
                {"year_end": "Year end must be greater than year start."}
            )

        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        year_start = validated_data.pop("year_start")
        year_end = validated_data.pop("year_end")
        set_active = validated_data.pop("set_active", False)
        active_semester_id = validated_data.pop("active_semester_id", None)

        school_year = SchoolYear.objects.create(
            user=user,
            name=build_school_year_name(year_start, year_end),
        )

        if set_active:
            activate_school_year(
                user=user,
                school_year=school_year,
                preferred_semester_id=active_semester_id,
            )

        return school_year

    def update(self, instance, validated_data):
        year_start = validated_data.pop("year_start", None)
        year_end = validated_data.pop("year_end", None)
        set_active = validated_data.pop("set_active", False)
        active_semester_id = validated_data.pop("active_semester_id", None)
        set_active_provided = "set_active" in self.initial_data

        if year_start is not None and year_end is not None:
            instance.name = build_school_year_name(year_start, year_end)
            instance.save(update_fields=["name"])

        if set_active:
            activate_school_year(
                user=self.context["request"].user,
                school_year=instance,
                preferred_semester_id=active_semester_id,
            )
        elif set_active_provided:
            deactivate_school_year(
                user=self.context["request"].user,
                school_year=instance,
            )

        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        parsed = parse_school_year_name(instance.name)
        data["year_start"] = parsed[0] if parsed else None
        data["year_end"] = parsed[1] if parsed else None
        return data


class SemesterSerializer(serializers.ModelSerializer):
    set_active = serializers.BooleanField(required=False, default=False, write_only=True)
    school_year_id = serializers.IntegerField(required=False, write_only=True, min_value=1)
    is_active = serializers.SerializerMethodField()
    active_school_year_id = serializers.SerializerMethodField()
    active_school_year_name = serializers.SerializerMethodField()

    class Meta:
        model = Semester
        fields = [
            "id",
            "name",
            "is_active",
            "active_school_year_id",
            "active_school_year_name",
            "set_active",
            "school_year_id",
        ]
        read_only_fields = ["id", "is_active", "active_school_year_id", "active_school_year_name"]

    def get_is_active(self, obj):
        return get_semester_active_link(obj) is not None

    def get_active_school_year_id(self, obj):
        link = get_semester_active_link(obj)
        return link.school_year_id if link else None

    def get_active_school_year_name(self, obj):
        link = get_semester_active_link(obj)
        return link.school_year.name if link else None

    def _get_target_school_year(self, user, school_year_id):
        if school_year_id:
            school_year = SchoolYear.objects.filter(user=user, id=school_year_id).first()
            if not school_year:
                raise serializers.ValidationError(
                    {"school_year_id": "Invalid school year selected."}
                )
            return school_year

        school_year = get_default_school_year_for_user(user)
        if not school_year:
            raise serializers.ValidationError(
                {"school_year_id": "Create a school year first before activating a semester."}
            )
        return school_year

    def _activate(self, semester, user, school_year_id=None):
        school_year = self._get_target_school_year(user, school_year_id)
        school_year_semester, _created = SchoolYearSemester.objects.get_or_create(
            school_year=school_year,
            semester=semester,
            defaults={"is_active": False},
        )
        activate_school_year_semester(user, school_year_semester)

    def create(self, validated_data):
        user = self.context["request"].user
        set_active = validated_data.pop("set_active", False)
        school_year_id = validated_data.pop("school_year_id", None)

        semester = Semester.objects.create(user=user, **validated_data)
        if set_active:
            self._activate(semester, user, school_year_id=school_year_id)
        return semester

    def update(self, instance, validated_data):
        set_active = validated_data.pop("set_active", False)
        school_year_id = validated_data.pop("school_year_id", None)

        name = validated_data.get("name")
        if name is not None:
            instance.name = name
            instance.save(update_fields=["name"])

        if set_active:
            self._activate(
                semester=instance,
                user=self.context["request"].user,
                school_year_id=school_year_id,
            )

        return instance


class SchoolYearSemesterSerializer(serializers.ModelSerializer):
    school_year_name = serializers.CharField(source="school_year.name", read_only=True)
    semester_name = serializers.CharField(source="semester.name", read_only=True)
    date_start = serializers.DateField(required=False, write_only=True)
    date_end = serializers.DateField(required=False, write_only=True)

    class Meta:
        model = SchoolYearSemester
        fields = [
            "id",
            "school_year",
            "school_year_name",
            "semester",
            "semester_name",
            "is_active",
            "date_start",
            "date_end",
        ]
        read_only_fields = ["id", "school_year_name", "semester_name"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if not request:
            return
        user = request.user
        self.fields["school_year"].queryset = SchoolYear.objects.filter(user=user)
        self.fields["semester"].queryset = Semester.objects.filter(user=user)

    def validate(self, attrs):
        date_start = attrs.get("date_start")
        date_end = attrs.get("date_end")
        if date_start and date_end and date_end <= date_start:
            raise serializers.ValidationError(
                {"date_end": "Date end must be after date start."}
            )

        school_year = attrs.get("school_year") or (self.instance.school_year if self.instance else None)
        semester = attrs.get("semester") or (self.instance.semester if self.instance else None)
        if school_year and semester:
            existing = SchoolYearSemester.objects.filter(
                school_year=school_year,
                semester=semester,
            )
            if self.instance is not None:
                existing = existing.exclude(id=self.instance.id)
            if existing.exists():
                raise serializers.ValidationError(
                    "This school year and semester pair already exists."
                )

        return attrs

    def create(self, validated_data):
        validated_data.pop("date_start", None)
        validated_data.pop("date_end", None)
        school_year_semester = SchoolYearSemester.objects.create(**validated_data)
        if school_year_semester.is_active:
            activate_school_year_semester(
                user=self.context["request"].user,
                school_year_semester=school_year_semester,
            )
        return school_year_semester

    def update(self, instance, validated_data):
        validated_data.pop("date_start", None)
        validated_data.pop("date_end", None)

        for field in ("school_year", "semester", "is_active"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()

        if instance.is_active:
            activate_school_year_semester(
                user=self.context["request"].user,
                school_year_semester=instance,
            )
        return instance


class GradePeriodSerializer(serializers.ModelSerializer):
    weight = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"))

    class Meta:
        model = Period
        fields = ["id", "name", "position", "weight", "is_active"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        instance = self.instance
        request = self.context.get("request")
        user = request.user if request else (instance.user if instance else None)
        position = attrs.get("position")
        weight = attrs.get("weight")

        if user is None:
            raise serializers.ValidationError("User context is required.")

        if position is None and instance is None:
            raise serializers.ValidationError({"position": "This field is required."})

        if position is not None:
            if position < 1 or position > 4:
                raise serializers.ValidationError(
                    {"position": "Order must be between 1 and 4."}
                )
            validate_period_position_unique(
                user=user,
                position=position,
                exclude_id=instance.id if instance else None,
            )

        effective_weight = weight
        if effective_weight is None:
            effective_weight = instance.weight if instance else Decimal("0")
        validate_period_total_weight(
            user=user,
            weight=effective_weight,
            exclude_id=instance.id if instance else None,
        )

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user if request else None
        if user is None:
            raise serializers.ValidationError("User context is required.")
        period = Period.objects.create(user=user, **validated_data)
        if period.is_active:
            activate_grade_period(user, period)
        return period

    def update(self, instance, validated_data):
        user = self.context["request"].user
        requested_is_active = validated_data.get("is_active", instance.is_active)

        if instance.is_active and requested_is_active is False:
            has_other_active = (
                get_grade_period_queryset(user)
                .exclude(id=instance.id)
                .filter(is_active=True)
                .exists()
            )
            if not has_other_active:
                raise serializers.ValidationError(
                    {"is_active": "At least one grading period must stay active."}
                )

        for field in ("name", "position", "weight", "is_active"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()

        if requested_is_active:
            activate_grade_period(user, instance)

        return instance
