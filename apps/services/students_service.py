from django.db.models import Q
from rest_framework import serializers

from apps.models import Attendance, AssessmentScore, GradePeriod, Record, Schedule, Section, Student, Subject


def apply_subject_search(queryset, search_term):
    search_term = (search_term or "").strip()
    if not search_term:
        return queryset
    return queryset.filter(Q(code__icontains=search_term) | Q(name__icontains=search_term))


def apply_section_filters(queryset, params):
    search_term = (params.get("search") or "").strip()
    school_year_sem = (params.get("school_year_sem") or "").strip()
    year_level = (params.get("year_level") or "").strip()

    if search_term:
        queryset = queryset.filter(name__icontains=search_term)

    if school_year_sem:
        if not school_year_sem.isdigit():
            raise serializers.ValidationError(
                {"school_year_sem": "school_year_sem must be a valid id."}
            )
        queryset = queryset.filter(school_year_sem_id=int(school_year_sem))

    if year_level:
        if not year_level.isdigit():
            raise serializers.ValidationError(
                {"year_level": "year_level must be a whole number."}
            )
        queryset = queryset.filter(year_level=int(year_level))

    return queryset


def validate_subject_code_unique(user, code, exclude_id=None):
    queryset = Subject.objects.filter(user=user, code__iexact=code)
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError({"code": "A subject with this code already exists."})


def validate_section_name_unique(school_year_sem, name, exclude_id=None):
    queryset = Section.objects.filter(
        school_year_sem=school_year_sem,
        name__iexact=name,
    )
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError(
            {"name": "This section already exists for this school term."}
        )


def ensure_subject_deletable(subject):
    if Schedule.objects.filter(subject=subject).exists():
        raise serializers.ValidationError("Cannot delete this item because it is already used.")


def ensure_section_deletable(section):
    if Schedule.objects.filter(section=section).exists():
        raise serializers.ValidationError("Cannot delete this item because it is already used.")


def get_student_queryset_for_user(user):
    return Student.objects.select_related(
        "section",
        "section__school_year_sem__school_year",
        "section__school_year_sem__semester",
    ).filter(
        section__school_year_sem__school_year__user=user,
        section__school_year_sem__semester__user=user,
    )


def apply_student_filters(queryset, params):
    section = (params.get("section") or "").strip()
    year_level = (params.get("year_level") or "").strip()
    search = (params.get("search") or "").strip()

    if section:
        if not section.isdigit():
            raise serializers.ValidationError({"section": "section must be a valid id."})
        queryset = queryset.filter(section_id=int(section))

    if year_level:
        if not year_level.isdigit():
            raise serializers.ValidationError(
                {"year_level": "year_level must be a whole number."}
            )
        queryset = queryset.filter(year_level=int(year_level))

    if search:
        queryset = queryset.filter(
            Q(student_id__icontains=search)
            | Q(first_name__icontains=search)
            | Q(middle_name__icontains=search)
            | Q(last_name__icontains=search)
        )

    return queryset


def validate_student_id_unique(student_id, exclude_id=None):
    queryset = Student.objects.filter(student_id__iexact=student_id)
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError({"student_id": "Student ID already exists."})


def validate_student_section_owner(user, section):
    if section.school_year_sem is None:
        raise serializers.ValidationError({"section": "Please select a section."})
    if section.school_year_sem.school_year.user_id != user.id:
        raise serializers.ValidationError({"section": "Please select a valid section."})


def validate_student_year_level_matches_section(year_level, section):
    if section is None:
        return
    if int(year_level) != int(section.year_level):
        raise serializers.ValidationError(
            {"year_level": "Student year level must match the selected section."}
        )


def derive_student_year_level_from_section(section):
    if section is None:
        return None
    return int(section.year_level)


def get_student_enrollment_queryset_for_user(user):
    return Record.objects.select_related(
        "student",
        "schedule",
        "schedule__subject",
        "schedule__section",
        "schedule__period",
        "schedule__school_year_semester__school_year",
        "schedule__school_year_semester__semester",
    ).filter(
        schedule__user=user,
        schedule__school_year_semester__school_year__user=user,
        schedule__school_year_semester__semester__user=user,
    )


def apply_student_enrollment_filters(queryset, params):
    student = (params.get("student") or "").strip()
    schedule = (params.get("schedule") or "").strip()

    if student:
        if not student.isdigit():
            raise serializers.ValidationError({"student": "student must be a valid id."})
        queryset = queryset.filter(student_id=int(student))

    if schedule:
        if not schedule.isdigit():
            raise serializers.ValidationError({"schedule": "schedule must be a valid id."})
        queryset = queryset.filter(schedule_id=int(schedule))

    return queryset


def validate_student_enrollment_owner(user, student, schedule):
    if schedule.user_id != user.id:
        raise serializers.ValidationError({"schedule": "Please select a valid schedule."})
    if (
        student.section is None
        or student.section.school_year_sem is None
        or student.section.school_year_sem.school_year.user_id != user.id
    ):
        raise serializers.ValidationError({"student": "Please select a valid student."})


def validate_student_enrollment_section_match(student, schedule):
    if student.section_id and schedule.section_id:
        if student.section_id == schedule.section_id:
            return
        raise serializers.ValidationError(
            {"schedule": "Student is not compatible with this schedule."}
        )
    if student.year_level and schedule.section and schedule.section.year_level:
        if int(student.year_level) == int(schedule.section.year_level):
            return
    raise serializers.ValidationError(
        {"schedule": "Student is not compatible with this schedule."}
    )


def _schedules_time_conflict(schedule_a, schedule_b):
    if not schedule_a.day or not schedule_b.day:
        return False
    if str(schedule_a.day) != str(schedule_b.day):
        return False

    if schedule_a.period_id and schedule_b.period_id and schedule_a.period_id == schedule_b.period_id:
        return True

    period_a = schedule_a.period if schedule_a.period_id else None
    period_b = schedule_b.period if schedule_b.period_id else None
    if not period_a or not period_b:
        return False
    if not period_a.time_start or not period_a.time_end:
        return False
    if not period_b.time_start or not period_b.time_end:
        return False

    return period_a.time_start < period_b.time_end and period_b.time_start < period_a.time_end


def validate_student_enrollment_time_conflict(student, schedule, exclude_id=None):
    queryset = (
        Record.objects.select_related("schedule__period", "schedule__subject", "schedule__section")
        .filter(student=student, is_active=True, schedule__day=schedule.day)
        .exclude(schedule_id=schedule.id)
    )
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)

    for enrollment in queryset:
        if _schedules_time_conflict(schedule, enrollment.schedule):
            existing = enrollment.schedule
            existing_label = f"{existing.subject.name} - {existing.section.name}"
            raise serializers.ValidationError(
                {
                    "schedule": (
                        f"This student already has another schedule conflict on "
                        f"{existing.day} ({existing_label})."
                    )
                }
            )


def validate_duplicate_active_enrollment(student, schedule, exclude_id=None):
    queryset = Record.objects.filter(student=student, schedule=schedule, is_active=True)
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError(
            {"student": "This student is already enrolled in this schedule."}
        )


def ensure_student_deletable(student):
    records = Record.objects.filter(student=student)
    if not records.exists():
        return

    record_ids = records.values_list("id", flat=True)
    if (
        Attendance.objects.filter(record_id__in=record_ids).exists()
        or AssessmentScore.objects.filter(record_id__in=record_ids).exists()
        or GradePeriod.objects.filter(record_id__in=record_ids).exists()
        or records.exists()
    ):
        raise serializers.ValidationError(
            "Cannot delete this student because attendance, scores, or records already exist."
        )


def ensure_enrollment_deletable(record):
    if (
        Attendance.objects.filter(record=record).exists()
        or AssessmentScore.objects.filter(record=record).exists()
        or GradePeriod.objects.filter(record=record).exists()
    ):
        raise serializers.ValidationError(
            "Cannot delete this enrollment because attendance, scores, or records already exist."
        )
