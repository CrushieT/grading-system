from rest_framework import serializers

from apps.models import Record, Schedule, SchoolYearSemester, Section, Student, Subject
from apps.services.students_service import (
    derive_student_year_level_from_section,
    get_student_queryset_for_user,
    validate_duplicate_active_enrollment,
    validate_student_enrollment_owner,
    validate_student_enrollment_section_match,
    validate_student_enrollment_time_conflict,
    validate_student_id_unique,
    validate_student_section_owner,
    validate_student_year_level_matches_section,
    validate_section_name_unique,
    validate_subject_code_unique,
)


class SubjectSerializer(serializers.ModelSerializer):
    code = serializers.CharField(max_length=10)
    name = serializers.CharField(max_length=25)
    units = serializers.IntegerField(required=False, default=1)

    class Meta:
        model = Subject
        fields = ["id", "code", "name", "units"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        instance = self.instance
        request = self.context.get("request")
        user = request.user if request else (instance.user if instance else None)

        if user is None:
            raise serializers.ValidationError("User context is required.")

        code = attrs.get("code", instance.code if instance else "")
        name = attrs.get("name", instance.name if instance else "")
        units = attrs.get("units", instance.units if instance else None)

        code = str(code or "").strip()
        name = str(name or "").strip()

        if not code:
            raise serializers.ValidationError({"code": "Subject code is required."})
        if not name:
            raise serializers.ValidationError({"name": "Subject name is required."})
        if units is None:
            units = 1
        if units <= 0:
            raise serializers.ValidationError({"units": "Units must be greater than 0."})

        validate_subject_code_unique(
            user=user,
            code=code,
            exclude_id=instance.id if instance else None,
        )

        attrs["code"] = code
        attrs["name"] = name
        attrs["units"] = units
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if not request:
            raise serializers.ValidationError("User context is required.")
        return Subject.objects.create(user=request.user, **validated_data)


class SectionSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=25)
    school_year_sem_label = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id",
            "name",
            "year_level",
            "school_year_sem",
            "school_year_sem_label",
        ]
        read_only_fields = ["id", "school_year_sem_label"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if not request:
            return
        user = request.user
        self.fields["school_year_sem"].queryset = SchoolYearSemester.objects.filter(
            school_year__user=user,
            semester__user=user,
        )

    def get_school_year_sem_label(self, obj):
        if not obj.school_year_sem_id:
            return ""
        return obj.school_year_sem.school_year.name

    def validate(self, attrs):
        instance = self.instance
        name = attrs.get("name", instance.name if instance else "")
        year_level = attrs.get("year_level", instance.year_level if instance else None)
        school_year_sem = attrs.get(
            "school_year_sem",
            instance.school_year_sem if instance else None,
        )

        name = str(name or "").strip()
        if not name:
            raise serializers.ValidationError({"name": "Section name is required."})
        if year_level is None:
            raise serializers.ValidationError({"year_level": "Year level is required."})
        if year_level <= 0:
            raise serializers.ValidationError(
                {"year_level": "Year level must be greater than 0."}
            )
        if year_level > 12:
            raise serializers.ValidationError(
                {"year_level": "Year level must not exceed 12."}
            )
        if school_year_sem is None:
            raise serializers.ValidationError(
                {"school_year_sem": "Please select a school year semester."}
            )

        validate_section_name_unique(
            school_year_sem=school_year_sem,
            name=name,
            exclude_id=instance.id if instance else None,
        )

        attrs["name"] = name
        return attrs


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    section_name = serializers.CharField(source="section.name", read_only=True)
    section_year_level = serializers.IntegerField(source="section.year_level", read_only=True)
    section_school_year_sem_label = serializers.SerializerMethodField()
    enrolled_schedules_count = serializers.SerializerMethodField()
    average_grade = serializers.SerializerMethodField()
    attendance_rate = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id",
            "student_id",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "gender",
            "contact_number",
            "year_level",
            "section",
            "section_name",
            "section_year_level",
            "section_school_year_sem_label",
            "enrolled_schedules_count",
            "average_grade",
            "attendance_rate",
        ]
        read_only_fields = [
            "id",
            "full_name",
            "section_name",
            "section_year_level",
            "section_school_year_sem_label",
            "enrolled_schedules_count",
            "average_grade",
            "attendance_rate",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if not request:
            return
        self.fields["section"].queryset = Section.objects.filter(
            school_year_sem__school_year__user=request.user,
            school_year_sem__semester__user=request.user,
        )

    def get_full_name(self, obj):
        middle = f" {obj.middle_name.strip()}" if obj.middle_name else ""
        return f"{obj.first_name}{middle} {obj.last_name}".strip()

    def get_enrolled_schedules_count(self, obj):
        return Record.objects.filter(student=obj, is_active=True, grade_period__isnull=True).count()

    def get_section_school_year_sem_label(self, obj):
        if not obj.section_id or not obj.section.school_year_sem_id:
            return ""
        return obj.section.school_year_sem.school_year.name

    def get_average_grade(self, _obj):
        return "--"

    def get_attendance_rate(self, _obj):
        return "--"

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            raise serializers.ValidationError("User context is required.")

        instance = self.instance
        student_id = str(attrs.get("student_id", instance.student_id if instance else "") or "").strip()
        first_name = str(attrs.get("first_name", instance.first_name if instance else "") or "").strip()
        middle_name = str(attrs.get("middle_name", instance.middle_name if instance else "") or "").strip()
        last_name = str(attrs.get("last_name", instance.last_name if instance else "") or "").strip()
        year_level = attrs.get("year_level")
        effective_year_level = year_level if year_level is not None else (instance.year_level if instance else None)
        section = attrs.get("section", instance.section if instance else None)
        gender = attrs.get("gender", instance.gender if instance else None)
        contact_number = attrs.get("contact_number", instance.contact_number if instance else None)

        if not student_id:
            raise serializers.ValidationError({"student_id": "Student ID is required."})
        if not first_name:
            raise serializers.ValidationError({"first_name": "First name is required."})
        if not last_name:
            raise serializers.ValidationError({"last_name": "Last name is required."})
        if section is None:
            raise serializers.ValidationError({"section": "Please select a section."})
        if effective_year_level is not None and effective_year_level <= 0:
            raise serializers.ValidationError({"year_level": "Year level must be greater than 0."})
        if effective_year_level is not None and effective_year_level > 12:
            raise serializers.ValidationError({"year_level": "Year level must not exceed 12."})

        validate_student_id_unique(student_id, exclude_id=instance.id if instance else None)
        validate_student_section_owner(request.user, section)
        section_year_level = derive_student_year_level_from_section(section)
        if year_level is not None:
            validate_student_year_level_matches_section(year_level, section)

        attrs["student_id"] = student_id
        attrs["first_name"] = first_name
        attrs["middle_name"] = middle_name or None
        attrs["last_name"] = last_name
        attrs["gender"] = str(gender or "").strip() or None
        attrs["contact_number"] = str(contact_number or "").strip() or None
        attrs["year_level"] = section_year_level
        return attrs


class StudentEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    schedule_label = serializers.SerializerMethodField()
    student_section_id = serializers.IntegerField(source="student.section_id", read_only=True)
    student_year_level = serializers.IntegerField(source="student.year_level", read_only=True)
    schedule_subject_name = serializers.CharField(source="schedule.subject.name", read_only=True)
    schedule_subject_code = serializers.CharField(source="schedule.subject.code", read_only=True)
    schedule_section_id = serializers.IntegerField(source="schedule.section_id", read_only=True)
    schedule_section_name = serializers.CharField(source="schedule.section.name", read_only=True)
    schedule_section_year_level = serializers.IntegerField(
        source="schedule.section.year_level",
        read_only=True,
    )
    schedule_day = serializers.CharField(source="schedule.day", read_only=True)
    schedule_period_display = serializers.SerializerMethodField()
    school_year_sem_display = serializers.SerializerMethodField()

    class Meta:
        model = Record
        fields = [
            "id",
            "student",
            "student_name",
            "student_section_id",
            "student_year_level",
            "schedule",
            "schedule_label",
            "schedule_subject_name",
            "schedule_subject_code",
            "schedule_section_id",
            "schedule_section_name",
            "schedule_section_year_level",
            "schedule_day",
            "schedule_period_display",
            "school_year_sem_display",
            "date_enrolled",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "student_name",
            "student_section_id",
            "student_year_level",
            "schedule_label",
            "schedule_subject_name",
            "schedule_subject_code",
            "schedule_section_id",
            "schedule_section_name",
            "schedule_section_year_level",
            "schedule_day",
            "schedule_period_display",
            "school_year_sem_display",
            "date_enrolled",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if not request:
            return
        user = request.user
        self.fields["student"].queryset = get_student_queryset_for_user(user).order_by(
            "last_name", "first_name", "id"
        )
        self.fields["schedule"].queryset = Schedule.objects.select_related(
            "subject",
            "section",
            "period",
            "school_year_semester__school_year",
            "school_year_semester__semester",
        ).filter(
            user=user,
            school_year_semester__school_year__user=user,
            school_year_semester__semester__user=user,
        ).order_by("day", "id")

    def get_student_name(self, obj):
        middle = f" {obj.student.middle_name.strip()}" if obj.student.middle_name else ""
        return f"{obj.student.first_name}{middle} {obj.student.last_name}".strip()

    def get_schedule_label(self, obj):
        subject = obj.schedule.subject.name
        section = obj.schedule.section.name
        day = obj.schedule.day or "-"
        return f"{subject} - {section} ({day})"

    def get_schedule_period_display(self, obj):
        if not obj.schedule.period_id:
            return "-"
        period = obj.schedule.period
        if period.time_start and period.time_end:
            return f"{period.name} ({period.time_start.strftime('%H:%M')}-{period.time_end.strftime('%H:%M')})"
        return period.name

    def get_school_year_sem_display(self, obj):
        school_year = obj.schedule.school_year_semester.school_year.name
        semester = obj.schedule.school_year_semester.semester.name
        return f"{school_year}, {semester}"

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            raise serializers.ValidationError("User context is required.")

        instance = self.instance
        student = attrs.get("student", instance.student if instance else None)
        schedule = attrs.get("schedule", instance.schedule if instance else None)
        is_active = attrs.get("is_active", instance.is_active if instance else True)

        if student is None:
            raise serializers.ValidationError({"student": "Please select a student."})
        if schedule is None:
            raise serializers.ValidationError({"schedule": "Please select a schedule."})

        validate_student_enrollment_owner(request.user, student, schedule)
        validate_student_enrollment_section_match(student, schedule)
        if is_active:
            validate_student_enrollment_time_conflict(
                student,
                schedule,
                exclude_id=instance.id if instance else None,
            )
            validate_duplicate_active_enrollment(
                student,
                schedule,
                exclude_id=instance.id if instance else None,
            )
        return attrs
