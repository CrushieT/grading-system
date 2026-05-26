from collections import defaultdict
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.models import Assessment, AssessmentScore, GradingTemplateItem, Period, Record, Schedule
from apps.services.setup_service import ensure_schedule_term_is_active
from apps.services.setup_service import get_grade_period_queryset


PASSING_GRADE = Decimal("75.00")


def _format_grade(value):
    return Decimal(value).quantize(Decimal("0.01"))


def _safe_decimal(value):
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def _schedule_display(schedule):
    return f"{schedule.subject.name} - {schedule.section.name}"


def _student_name(student):
    middle = f" {student.middle_name.strip()}" if student.middle_name else ""
    return f"{student.first_name}{middle} {student.last_name}".strip()


def validate_compute_inputs(user, schedule_id, grade_period_id):
    if not schedule_id:
        raise serializers.ValidationError({"detail": "Please select a schedule."})
    if not grade_period_id:
        raise serializers.ValidationError({"detail": "Please select a grade period."})

    schedule = (
        Schedule.objects.select_related("subject", "section", "grading_template")
        .filter(id=schedule_id, user=user)
        .first()
    )
    if schedule is None:
        raise serializers.ValidationError({"detail": "Please select a schedule."})
    ensure_schedule_term_is_active(schedule)

    grade_period = get_grade_period_queryset(user).filter(id=grade_period_id).first()
    if grade_period is None:
        raise serializers.ValidationError({"detail": "Please select a grade period."})

    if schedule.grading_template_id is None:
        raise serializers.ValidationError({"detail": "This schedule has no grading template."})

    enrollments = list(
        Record.objects.select_related("student")
        .filter(schedule=schedule, is_active=True, grade_period__isnull=True)
        .order_by("student__last_name", "student__first_name", "id")
    )
    if not enrollments:
        raise serializers.ValidationError({"detail": "No students are enrolled in this schedule."})

    locked_exists = Record.objects.filter(
        schedule=schedule,
        grade_period=grade_period,
        is_locked=True,
    ).exists()
    if locked_exists:
        raise serializers.ValidationError({"detail": "Cannot recompute locked records."})

    components = list(
        GradingTemplateItem.objects.filter(
            grading_template_id=schedule.grading_template_id,
            is_active=True,
        ).order_by("order", "id")
    )
    return schedule, grade_period, enrollments, components


def compute_schedule_period_grades(user, schedule_id, grade_period_id, persist=False):
    schedule, grade_period, enrollments, components = validate_compute_inputs(
        user, schedule_id, grade_period_id
    )

    assessments = list(
        Assessment.objects.filter(
            is_active=True,
            schedule=schedule,
            period=grade_period,
            component_id__in=[item.id for item in components],
        ).order_by("id")
    )
    by_component = defaultdict(list)
    for assessment in assessments:
        by_component[assessment.component_id].append(assessment)

    all_assessment_ids = [item.id for item in assessments]
    score_map = {
        (item.record_id, item.assessment_id): item
        for item in AssessmentScore.objects.filter(assessment_id__in=all_assessment_ids)
    }

    computed_rows = []
    has_incomplete = False
    now = timezone.now()

    for enrollment in enrollments:
        final_grade = Decimal("0.00")
        component_breakdown = []
        missing_scores = False
        missing_components = False

        for component in components:
            component_assessments = by_component.get(component.id, [])
            earned_score = Decimal("0.00")
            possible_score = Decimal("0.00")

            if not component_assessments:
                missing_components = True
            else:
                for assessment in component_assessments:
                    possible_score += _safe_decimal(assessment.max_score)
                    score_obj = score_map.get((enrollment.id, assessment.id))
                    if score_obj is None or score_obj.score is None:
                        # Missing score is treated as 0 only when the assessment exists.
                        missing_scores = True
                        continue
                    earned_score += _safe_decimal(score_obj.score)

            raw_percentage = Decimal("0.00")
            if possible_score > 0:
                raw_percentage = (earned_score / possible_score) * Decimal("100.00")
            weighted_score = (raw_percentage * _safe_decimal(component.weight)) / Decimal("100.00")
            final_grade += weighted_score

            component_breakdown.append(
                {
                    "component": component.type,
                    "weight": float(_format_grade(_safe_decimal(component.weight))),
                    "earned_score": float(_format_grade(earned_score)),
                    "possible_score": float(_format_grade(possible_score)),
                    "raw_percentage": float(_format_grade(raw_percentage)),
                    "weighted_score": float(_format_grade(weighted_score)),
                }
            )

        final_grade = _format_grade(final_grade)
        # Softer period-remarks rule:
        # missing assessments/scores still reduce the computed grade (missing scores are treated as 0),
        # but remarks follow the final numeric threshold.
        remarks = "Passed" if final_grade >= PASSING_GRADE else "Failed"
        if missing_scores or missing_components:
            has_incomplete = True

        row = {
            "student": enrollment.student.id,
            "student_name": _student_name(enrollment.student),
            "student_id": enrollment.student.student_id,
            "schedule": schedule.id,
            "schedule_display": _schedule_display(schedule),
            "grade_period": grade_period.id,
            "grade_period_name": grade_period.name,
            "component_breakdown": component_breakdown,
            "final_grade": float(final_grade),
            "remarks": remarks,
            "computed_at": now,
        }
        computed_rows.append(row)

        if persist:
            Record.objects.update_or_create(
                schedule=schedule,
                student=enrollment.student,
                grade_period=grade_period,
                defaults={
                    "is_active": True,
                    "final_grade": final_grade,
                    "remarks": remarks,
                    "computed_at": now,
                    "component_breakdown": component_breakdown,
                },
            )

    return {
        "schedule": schedule,
        "grade_period": grade_period,
        "items": computed_rows,
        "has_incomplete": has_incomplete,
    }


def compute_overall_grade_map(user, schedule):
    """
    Computes overall weighted grade per student for a schedule across all grade periods.
    If any required period record is missing, ungraded, or marked incomplete, overall is incomplete.
    """
    periods = list(get_grade_period_queryset(user).filter(is_active=True).order_by("position", "id"))
    if not periods:
        return {}

    period_ids = [item.id for item in periods]
    period_weights = {item.id: _safe_decimal(item.weight) for item in periods}

    enrollment_records = list(
        Record.objects.select_related("student")
        .filter(schedule=schedule, is_active=True, grade_period__isnull=True)
        .order_by("student__last_name", "student__first_name", "id")
    )
    if not enrollment_records:
        return {}

    grade_records = list(
        Record.objects.filter(
            schedule=schedule,
            grade_period_id__in=period_ids,
        )
    )
    grade_map = {(item.student_id, item.grade_period_id): item for item in grade_records}

    out = {}
    for enrollment in enrollment_records:
        student = enrollment.student
        weighted_total = Decimal("0.00")
        missing = False
        has_incomplete_period = False

        for period in periods:
            rec = grade_map.get((student.id, period.id))
            if rec is None or rec.final_grade is None:
                missing = True
                continue
            if str(rec.remarks or "").strip().lower() == "incomplete":
                has_incomplete_period = True
            weighted_total += (_safe_decimal(rec.final_grade) * period_weights[period.id]) / Decimal("100.00")

        overall_grade = _format_grade(weighted_total)
        overall_remarks = "Passed" if overall_grade >= PASSING_GRADE else "Failed"
        if missing or has_incomplete_period:
            overall_remarks = "Incomplete"

        out[student.id] = {
            "overall_average_grade": float(overall_grade),
            "overall_remarks": overall_remarks,
        }

    return out
