from datetime import date, datetime, time

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers

from apps.models import Attendance, Record, Schedule, Student
from apps.services.setup_service import ensure_schedule_term_is_active


STATUS_ALIASES = {
    "P": Attendance.Status.PRESENT,
    "PRESENT": Attendance.Status.PRESENT,
    "A": Attendance.Status.ABSENT,
    "ABSENT": Attendance.Status.ABSENT,
    "L": Attendance.Status.LATE,
    "LATE": Attendance.Status.LATE,
    "E": Attendance.Status.EXCUSE,
    "EXCUSE": Attendance.Status.EXCUSE,
    "EXCUSED": Attendance.Status.EXCUSE,
}


def get_attendance_queryset_for_user(user):
    return Attendance.objects.select_related(
        "record",
        "record__student",
        "record__schedule",
        "record__schedule__subject",
        "record__schedule__section",
        "record__schedule__school_year_semester__school_year",
        "record__schedule__school_year_semester__semester",
    ).filter(
        record__schedule__user=user,
        record__schedule__school_year_semester__school_year__user=user,
        record__schedule__school_year_semester__semester__user=user,
    )


def normalize_attendance_status(raw_status):
    key = str(raw_status or "").strip().upper()
    normalized = STATUS_ALIASES.get(key)
    if not normalized:
        raise serializers.ValidationError({"status": "Invalid attendance status."})
    return normalized


def normalize_attendance_date(raw_date):
    if isinstance(raw_date, datetime):
        return raw_date.date()
    if isinstance(raw_date, date):
        return raw_date

    parsed = parse_date(str(raw_date or "").strip())
    if parsed is None:
        raise serializers.ValidationError({"date": "date is required."})
    return parsed


def build_day_time_from_date(target_date):
    day_time = datetime.combine(target_date, time.min)
    if timezone.is_naive(day_time):
        day_time = timezone.make_aware(day_time, timezone.get_current_timezone())
    return day_time


def resolve_schedule_for_user(user, schedule_value, require_active=False):
    schedule_id = schedule_value.id if isinstance(schedule_value, Schedule) else schedule_value
    try:
        schedule_id = int(schedule_id)
    except (TypeError, ValueError):
        raise serializers.ValidationError({"schedule": "Please select a valid schedule."})

    schedule = (
        Schedule.objects.select_related(
            "school_year_semester__school_year",
            "school_year_semester__semester",
        )
        .filter(
            id=schedule_id,
            user=user,
            school_year_semester__school_year__user=user,
            school_year_semester__semester__user=user,
        )
        .first()
    )
    if schedule is None:
        raise serializers.ValidationError({"schedule": "Please select a valid schedule."})
    if require_active:
        ensure_schedule_term_is_active(schedule)
    return schedule


def resolve_student_for_user(user, student_value):
    student_id = student_value.id if isinstance(student_value, Student) else student_value
    try:
        student_id = int(student_id)
    except (TypeError, ValueError):
        raise serializers.ValidationError({"student": "Please select a valid student."})

    student = (
        Student.objects.select_related(
            "section__school_year_sem__school_year",
            "section__school_year_sem__semester",
        )
        .filter(
            id=student_id,
            section__school_year_sem__school_year__user=user,
            section__school_year_sem__semester__user=user,
        )
        .first()
    )
    if student is None:
        raise serializers.ValidationError({"student": "Please select a valid student."})
    return student


def get_record_for_student_schedule_for_user(user, student, schedule):
    record = Record.objects.select_related("student", "schedule").filter(
        student=student,
        schedule=schedule,
        schedule__user=user,
        grade_period__isnull=True,
    ).first()
    if record is None:
        raise serializers.ValidationError(
            {"student": "No students found for this schedule."}
        )
    return record


def ensure_no_duplicate_attendance(record, target_date, exclude_id=None):
    queryset = Attendance.objects.filter(record=record, day_time__date=target_date)
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError("Duplicate attendance record detected.")


def apply_attendance_filters(queryset, params):
    schedule = (params.get("schedule") or "").strip()
    date_value = (params.get("date") or "").strip()
    student = (params.get("student") or "").strip()
    status = (params.get("status") or "").strip()

    if schedule:
        if not schedule.isdigit():
            raise serializers.ValidationError({"schedule": "schedule must be a valid id."})
        queryset = queryset.filter(record__schedule_id=int(schedule))

    if date_value:
        target_date = normalize_attendance_date(date_value)
        queryset = queryset.filter(day_time__date=target_date)

    if student:
        if not student.isdigit():
            raise serializers.ValidationError({"student": "student must be a valid id."})
        queryset = queryset.filter(record__student_id=int(student))

    if status:
        queryset = queryset.filter(status=normalize_attendance_status(status))

    return queryset


def build_attendance_summary(queryset):
    total_classes = queryset.count()
    present_count = queryset.filter(status=Attendance.Status.PRESENT).count()
    absent_count = queryset.filter(status=Attendance.Status.ABSENT).count()
    late_count = queryset.filter(status=Attendance.Status.LATE).count()
    excused_count = queryset.filter(status=Attendance.Status.EXCUSE).count()
    attendance_percentage = round((present_count / total_classes) * 100, 2) if total_classes else 0

    return {
        "total_classes": total_classes,
        "present_count": present_count,
        "absent_count": absent_count,
        "late_count": late_count,
        "excused_count": excused_count,
        "attendance_percentage": attendance_percentage,
    }


def summarize_attendance_for_user(user, *, student_id, schedule_id=None):
    if student_id in (None, ""):
        raise serializers.ValidationError({"student": "student is required."})

    student = resolve_student_for_user(user, student_id)
    queryset = get_attendance_queryset_for_user(user).filter(record__student=student)

    if schedule_id not in (None, ""):
        schedule = resolve_schedule_for_user(user, schedule_id)
        queryset = queryset.filter(record__schedule=schedule)

    return build_attendance_summary(queryset)


def upsert_attendance_for_user(user, *, student_id, schedule_id, date_value, status):
    if student_id in (None, ""):
        raise serializers.ValidationError({"student": "student is required."})
    if schedule_id in (None, ""):
        raise serializers.ValidationError({"schedule": "schedule is required."})
    if date_value in (None, ""):
        raise serializers.ValidationError({"date": "date is required."})
    if status in (None, ""):
        raise serializers.ValidationError({"status": "status is required."})

    student = resolve_student_for_user(user, student_id)
    schedule = resolve_schedule_for_user(user, schedule_id, require_active=True)
    record = get_record_for_student_schedule_for_user(user, student, schedule)
    target_date = normalize_attendance_date(date_value)
    normalized_status = normalize_attendance_status(status)
    target_day_time = build_day_time_from_date(target_date)

    attendance = Attendance.objects.filter(
        record=record,
        day_time__date=target_date,
    ).first()
    if attendance is None:
        attendance = Attendance.objects.create(
            record=record,
            day_time=target_day_time,
            status=normalized_status,
        )
        return attendance, True

    attendance.day_time = target_day_time
    attendance.status = normalized_status
    attendance.save(update_fields=["day_time", "status"])
    return attendance, False


@transaction.atomic
def bulk_save_attendance_for_user(user, items):
    if not isinstance(items, list):
        raise serializers.ValidationError({"items": "Expected a list of attendance records."})
    if not items:
        raise serializers.ValidationError({"items": "Provide at least one attendance record."})

    saved_records = []
    created_count = 0
    updated_count = 0

    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise serializers.ValidationError(
                {f"items[{index}]": "Each item must be an object."}
            )

        attendance, created = upsert_attendance_for_user(
            user,
            student_id=item.get("student"),
            schedule_id=item.get("schedule"),
            date_value=item.get("date"),
            status=item.get("status"),
        )
        saved_records.append(attendance)
        if created:
            created_count += 1
        else:
            updated_count += 1

    saved_status_counts = build_attendance_summary(Attendance.objects.filter(id__in=[item.id for item in saved_records]))
    summary = {
        "saved_count": len(saved_records),
        "created_count": created_count,
        "updated_count": updated_count,
        **saved_status_counts,
    }
    return saved_records, summary
