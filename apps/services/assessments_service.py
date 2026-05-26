from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Avg, Q
from rest_framework import serializers

from apps.models import (
    Assessment,
    AssessmentScore,
    GradingTemplateItem,
    Period,
    Record,
    Schedule,
)
from apps.services.grading_service import get_active_default_template
from apps.services.setup_service import ensure_grade_period_is_active_for_user, ensure_schedule_term_is_active
from apps.services.setup_service import get_grade_period_queryset


def get_schedule_queryset_for_user(user):
    return Schedule.objects.select_related(
        "subject",
        "section",
        "school_year_semester__school_year",
        "school_year_semester__semester",
        "grading_template",
    ).filter(
        user=user,
        school_year_semester__school_year__user=user,
        school_year_semester__semester__user=user,
    )


def get_assessment_queryset_for_user(user):
    return Assessment.objects.select_related(
        "schedule",
        "schedule__subject",
        "schedule__section",
        "schedule__school_year_semester__school_year",
        "schedule__school_year_semester__semester",
        "period",
        "component",
        "component__grading_template",
    ).filter(
        is_active=True,
        schedule__user=user,
        schedule__school_year_semester__school_year__user=user,
        schedule__school_year_semester__semester__user=user,
    )


def _parse_int_param(value, field_name):
    raw = (value or "").strip()
    if not raw:
        return None
    if not raw.isdigit():
        raise serializers.ValidationError({field_name: f"{field_name} must be a valid id."})
    return int(raw)


def _parse_date_param(value, field_name):
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise serializers.ValidationError({field_name: f"{field_name} must be in YYYY-MM-DD format."})


def apply_assessment_filters(queryset, params):
    schedule_id = _parse_int_param(params.get("schedule"), "schedule")
    grade_period_id = _parse_int_param(params.get("grade_period"), "grade_period")
    component_id = _parse_int_param(params.get("component"), "component")
    search = (params.get("search") or "").strip()
    date_from = _parse_date_param(params.get("date_from"), "date_from")
    date_to = _parse_date_param(params.get("date_to"), "date_to")

    if schedule_id:
        queryset = queryset.filter(schedule_id=schedule_id)
    if grade_period_id:
        queryset = queryset.filter(period_id=grade_period_id)
    if component_id:
        queryset = queryset.filter(component_id=component_id)
    if search:
        queryset = queryset.filter(
            Q(title__icontains=search)
            | Q(type__icontains=search)
            | Q(schedule__subject__code__icontains=search)
            | Q(schedule__subject__name__icontains=search)
            | Q(schedule__section__name__icontains=search)
        )
    if date_from:
        queryset = queryset.filter(date_given__gte=date_from)
    if date_to:
        queryset = queryset.filter(date_given__lte=date_to)
    return queryset


def resolve_schedule_for_user(user, schedule, require_active=False):
    schedule_id = schedule.id if isinstance(schedule, Schedule) else int(schedule)
    schedule_obj = get_schedule_queryset_for_user(user).filter(id=schedule_id).first()
    if schedule_obj is None:
        raise serializers.ValidationError({"schedule": "Please select a valid schedule."})
    if require_active:
        ensure_schedule_term_is_active(schedule_obj)
    return schedule_obj


def ensure_assessment_schedule_active(assessment):
    ensure_schedule_term_is_active(assessment.schedule)
    ensure_grade_period_is_active_for_user(assessment.schedule.user, assessment.period)


def resolve_grade_period_for_user(user, grade_period):
    period_id = grade_period.id if isinstance(grade_period, Period) else int(grade_period)
    period_obj = get_grade_period_queryset(user).filter(id=period_id).first()
    if period_obj is None:
        raise serializers.ValidationError({"grade_period": "Please select a valid grade period."})
    return period_obj


def resolve_component_for_template(component, template):
    component_id = component.id if isinstance(component, GradingTemplateItem) else int(component)
    component_obj = GradingTemplateItem.objects.select_related("grading_template").filter(
        id=component_id
    ).first()
    if component_obj is None:
        raise serializers.ValidationError(
            {"component": "Please select a valid grading component."}
        )
    if component_obj.grading_template_id != template.id:
        raise serializers.ValidationError(
            {
                "component": "This grading component does not belong to the selected schedule's template."
            }
        )
    if not component_obj.is_active:
        raise serializers.ValidationError({"component": "Please select an active grading component."})
    return component_obj


def resolve_schedule_template_or_default(user, schedule):
    schedule_template = schedule.grading_template
    if schedule_template and schedule_template.user_id == user.id and schedule_template.is_active:
        return schedule_template

    default_template = get_active_default_template(user)
    if default_template is None:
        raise serializers.ValidationError(
            {"component": "Please assign a grading template to this schedule first."}
        )
    return default_template


def get_components_for_schedule(user, schedule):
    template = resolve_schedule_template_or_default(user, schedule)
    components = GradingTemplateItem.objects.filter(
        grading_template=template,
        is_active=True,
    ).order_by("order", "id")
    return template, components


def validate_assessment_title_unique(schedule, grade_period, title, exclude_id=None):
    queryset = Assessment.objects.filter(
        is_active=True,
        schedule=schedule,
        period=grade_period,
        title__iexact=title.strip(),
    )
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError(
            {
                "title": "Assessment already exists for this schedule and grade period."
            }
        )


def get_assessment_score_stats(assessment):
    queryset = AssessmentScore.objects.filter(assessment=assessment)
    submitted_count = queryset.filter(score__isnull=False).count()
    average_score = queryset.aggregate(avg=Avg("score"))["avg"]
    return submitted_count, average_score


def delete_or_deactivate_assessment(assessment):
    if AssessmentScore.objects.filter(assessment=assessment).exists():
        assessment.is_active = False
        assessment.save(update_fields=["is_active"])
        return "deactivated"
    assessment.delete()
    return "deleted"


def get_assessment_records_with_scores(assessment):
    records = list(
        Record.objects.select_related("student")
        .filter(schedule=assessment.schedule, is_active=True, grade_period__isnull=True)
        .order_by("student__last_name", "student__first_name", "id")
    )
    score_map = {
        item.record_id: item
        for item in AssessmentScore.objects.filter(
            assessment=assessment,
            record_id__in=[record.id for record in records],
        )
    }

    rows = []
    for record in records:
        student = record.student
        middle = f" {student.middle_name.strip()}" if student.middle_name else ""
        full_name = f"{student.first_name}{middle} {student.last_name}".strip()
        score_obj = score_map.get(record.id)
        score_value = score_obj.score if score_obj else None
        rows.append(
            {
                "record": record.id,
                "student": student.id,
                "student_name": full_name,
                "student_id": student.student_id,
                "score": score_value,
                "is_entered": score_value is not None,
            }
        )
    return rows


def _normalize_score(raw_score, max_score, item_key):
    if raw_score in (None, ""):
        return None
    try:
        score = Decimal(str(raw_score))
    except (InvalidOperation, ValueError, TypeError):
        raise serializers.ValidationError({item_key: "Score must be a valid number."})
    if score < 0:
        raise serializers.ValidationError({item_key: "Score cannot be less than 0."})
    if score > max_score:
        raise serializers.ValidationError(
            {item_key: f"Score cannot be greater than {max_score}."}
        )
    return score.quantize(Decimal("0.01"))


@transaction.atomic
def bulk_save_assessment_scores(assessment, items):
    if not isinstance(items, list):
        raise serializers.ValidationError(
            {"items": "Expected a list of score records."}
        )

    records = Record.objects.filter(
        schedule=assessment.schedule,
        is_active=True,
        grade_period__isnull=True,
    )
    record_map = {item.id: item for item in records}
    existing_map = {
        item.record_id: item
        for item in AssessmentScore.objects.filter(
            assessment=assessment,
            record_id__in=record_map.keys(),
        )
    }
    max_score = Decimal(str(assessment.max_score))

    created_count = 0
    updated_count = 0
    cleared_count = 0

    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise serializers.ValidationError(
                {f"items[{index}]": "Each item must be an object."}
            )

        raw_record_id = item.get("record")
        try:
            record_id = int(raw_record_id)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                {f"items[{index}].record": "record is required."}
            )

        if record_id not in record_map:
            raise serializers.ValidationError(
                {
                    f"items[{index}].record": (
                        "Invalid student enrollment for this assessment schedule."
                    )
                }
            )

        score = _normalize_score(
            item.get("score"),
            max_score=max_score,
            item_key=f"items[{index}].score",
        )
        score_obj = existing_map.get(record_id)

        if score is None:
            if score_obj:
                score_obj.delete()
                existing_map.pop(record_id, None)
                cleared_count += 1
            continue

        if score_obj is None:
            AssessmentScore.objects.create(
                assessment=assessment,
                record_id=record_id,
                score=score,
            )
            created_count += 1
        else:
            if score_obj.score != score:
                score_obj.score = score
                score_obj.save(update_fields=["score"])
                updated_count += 1

    rows = get_assessment_records_with_scores(assessment)
    entered_count = sum(1 for row in rows if row["score"] is not None)
    summary = {
        "student_count": len(rows),
        "entered_count": entered_count,
        "pending_count": max(len(rows) - entered_count, 0),
        "created_count": created_count,
        "updated_count": updated_count,
        "cleared_count": cleared_count,
        "saved_count": created_count + updated_count + cleared_count,
    }
    return rows, summary
    ensure_grade_period_is_active_for_user(
        assessment.schedule.user,
        assessment.period,
        field_name="grade_period",
    )
