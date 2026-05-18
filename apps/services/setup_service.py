import re
from decimal import Decimal

from rest_framework import serializers

from apps.models import (
    Assessment,
    AssessmentTypeWeight,
    GradePart,
    GradePeriod,
    Period,
    Schedule,
    SchoolYear,
    SchoolYearSemester,
    Semester,
)


SCHOOL_YEAR_NAME_PATTERN = re.compile(r"^\s*(\d{4})\s*-\s*(\d{4})\s*$")


def parse_school_year_name(name):
    if not name:
        return None
    match = SCHOOL_YEAR_NAME_PATTERN.match(name)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def build_school_year_name(year_start, year_end):
    return f"{int(year_start)}-{int(year_end)}"


def get_school_year_is_active(school_year):
    return SchoolYearSemester.objects.filter(
        school_year=school_year,
        is_active=True,
    ).exists()


def get_semester_active_link(semester):
    return (
        SchoolYearSemester.objects.select_related("school_year")
        .filter(semester=semester, is_active=True)
        .order_by("id")
        .first()
    )


def _deactivate_all_school_year_semesters(user):
    SchoolYearSemester.objects.filter(school_year__user=user).update(is_active=False)


def activate_school_year(user, school_year, preferred_semester_id=None):
    relation_qs = SchoolYearSemester.objects.filter(
        school_year=school_year,
        semester__user=user,
    ).order_by("id")

    relation = None
    if preferred_semester_id is not None:
        relation = relation_qs.filter(semester_id=preferred_semester_id).first()
        if relation is None:
            raise serializers.ValidationError(
                {"active_semester_id": "Semester does not belong to this school year."}
            )

    if relation is None:
        relation = relation_qs.first()

    if relation is None:
        fallback_semester = Semester.objects.filter(user=user).order_by("id").first()
        if fallback_semester is None:
            raise serializers.ValidationError(
                {"set_active": "Create a semester first before activating a school year."}
            )
        relation = SchoolYearSemester.objects.create(
            school_year=school_year,
            semester=fallback_semester,
            is_active=False,
        )

    _deactivate_all_school_year_semesters(user)
    relation.is_active = True
    relation.save(update_fields=["is_active"])
    return relation


def activate_school_year_semester(user, school_year_semester):
    if school_year_semester.school_year.user_id != user.id:
        raise serializers.ValidationError("You do not have access to this school year semester.")
    if school_year_semester.semester.user_id != user.id:
        raise serializers.ValidationError("You do not have access to this semester.")

    _deactivate_all_school_year_semesters(user)
    school_year_semester.is_active = True
    school_year_semester.save(update_fields=["is_active"])
    return school_year_semester


def get_default_school_year_for_user(user):
    active_link = (
        SchoolYearSemester.objects.select_related("school_year")
        .filter(school_year__user=user, is_active=True)
        .order_by("id")
        .first()
    )
    if active_link:
        return active_link.school_year
    return SchoolYear.objects.filter(user=user).order_by("-id").first()


def ensure_school_year_deletable(school_year):
    in_use = Schedule.objects.filter(school_year_semester__school_year=school_year).exists()
    if in_use:
        raise serializers.ValidationError(
            "This item cannot be deleted because it is already used."
        )


def ensure_semester_deletable(semester):
    in_use = Schedule.objects.filter(school_year_semester__semester=semester).exists()
    if in_use:
        raise serializers.ValidationError(
            "This item cannot be deleted because it is already used."
        )


def ensure_school_year_semester_deletable(school_year_semester):
    in_use = Schedule.objects.filter(school_year_semester=school_year_semester).exists()
    if in_use:
        raise serializers.ValidationError(
            "This item cannot be deleted because it is already used."
        )


def ensure_period_deletable(period):
    has_dependencies = (
        Assessment.objects.filter(period=period).exists()
        or GradePart.objects.filter(period=period).exists()
        or AssessmentTypeWeight.objects.filter(period=period).exists()
        or GradePeriod.objects.filter(period=period).exists()
    )
    if has_dependencies:
        raise serializers.ValidationError(
            "This item cannot be deleted because it is already used."
        )


def validate_period_position_unique(position, exclude_id=None):
    qs = Period.objects.filter(position=position)
    if exclude_id is not None:
        qs = qs.exclude(id=exclude_id)
    if qs.exists():
        raise serializers.ValidationError(
            {"position": "A grading period with this order already exists."}
        )


def validate_period_total_weight(weight, exclude_id=None):
    weight = Decimal(weight)
    total = Period.objects.exclude(id=exclude_id).values_list("weight", flat=True)
    running = sum((Decimal(value) for value in total), Decimal("0"))
    if running + weight > Decimal("100"):
        raise serializers.ValidationError(
            {"weight": "Total grading period weight cannot exceed 100."}
        )
