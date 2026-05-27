import csv
from decimal import Decimal
from io import StringIO

from django.db.models import Q
from rest_framework import serializers

from apps.models import Attendance, Period, Record, Schedule


def _safe_decimal(value):
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def get_records_queryset_for_user(user):
    return Record.objects.select_related(
        "student",
        "schedule__subject",
        "schedule__section",
        "grade_period",
    ).filter(
        schedule__user=user,
        grade_period__isnull=False,
    )


def apply_records_filters(queryset, params):
    schedule = str(params.get("schedule") or "").strip()
    grade_period = str(params.get("grade_period") or "").strip()
    student = str(params.get("student") or "").strip()
    remarks = str(params.get("remarks") or "").strip()
    search = str(params.get("search") or "").strip()

    if not schedule:
        raise serializers.ValidationError({"detail": "Please select a schedule."})
    if not grade_period:
        raise serializers.ValidationError({"detail": "Please select a grade period."})

    if not schedule.isdigit():
        raise serializers.ValidationError({"schedule": "schedule must be a valid id."})
    if not grade_period.isdigit():
        raise serializers.ValidationError({"grade_period": "grade_period must be a valid id."})

    queryset = queryset.filter(schedule_id=int(schedule), grade_period_id=int(grade_period))

    if student:
        if not student.isdigit():
            raise serializers.ValidationError({"student": "student must be a valid id."})
        queryset = queryset.filter(student_id=int(student))

    if remarks:
        queryset = queryset.filter(remarks__iexact=remarks)

    if search:
        queryset = queryset.filter(
            Q(student__first_name__icontains=search)
            | Q(student__middle_name__icontains=search)
            | Q(student__last_name__icontains=search)
            | Q(student__student_id__icontains=search)
            | Q(schedule__subject__name__icontains=search)
            | Q(schedule__section__name__icontains=search)
        )

    return queryset.order_by("student__last_name", "student__first_name", "id")


def build_records_csv(queryset):
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow(
        [
            "Student ID",
            "Student Name",
            "Schedule",
            "Subject",
            "Section",
            "Grade Period",
            "Component Breakdown",
            "Final Grade",
            "Remarks",
            "Computed At",
        ]
    )

    schedule_label = "-"
    period_label = "-"
    for item in queryset:
        schedule_label = f"{item.schedule.subject.name} - {item.schedule.section.name}"
        period_label = item.grade_period.name if item.grade_period else "-"
        components = []
        for part in (item.component_breakdown or []):
            name = part.get("component", "-")
            weight = part.get("weight", 0)
            raw = part.get("raw_percentage", 0)
            components.append(f"{name} ({weight}%): {raw}")

        middle = f" {item.student.middle_name.strip()}" if item.student.middle_name else ""
        student_name = f"{item.student.first_name}{middle} {item.student.last_name}".strip()

        writer.writerow(
            [
                item.student.student_id,
                student_name,
                schedule_label,
                item.schedule.subject.name,
                item.schedule.section.name,
                period_label,
                " | ".join(components),
                item.final_grade if item.final_grade is not None else "",
                item.remarks or "",
                item.computed_at.isoformat() if item.computed_at else "",
            ]
        )

    filename = f"records_{schedule_label.replace(' ', '_')}_{period_label.replace(' ', '_')}.csv"
    return out.getvalue(), filename


def summarize_attendance_by_schedule(user, schedule_id):
    schedule_value = str(schedule_id or "").strip()
    if not schedule_value:
        raise serializers.ValidationError({"detail": "Please select a schedule."})
    if not schedule_value.isdigit():
        raise serializers.ValidationError({"schedule": "schedule must be a valid id."})

    schedule = Schedule.objects.filter(id=int(schedule_value), user=user).first()
    if schedule is None:
        raise serializers.ValidationError({"detail": "Please select a schedule."})

    enrollments = list(
        Record.objects.select_related("student")
        .filter(schedule=schedule, is_active=True, grade_period__isnull=True)
        .order_by("student__last_name", "student__first_name", "id")
    )
    if not enrollments:
        raise serializers.ValidationError({"detail": "No students are enrolled in this schedule."})

    attendance_qs = Attendance.objects.select_related("record__student").filter(record__in=enrollments)
    total_class_days = attendance_qs.values_list("day_time__date", flat=True).distinct().count()

    per_student = []
    class_present_equivalent = Decimal("0.00")
    total_students = len(enrollments)
    for enrollment in enrollments:
        student_att = attendance_qs.filter(record=enrollment)
        present = student_att.filter(status=Attendance.Status.PRESENT).count()
        absent = student_att.filter(status=Attendance.Status.ABSENT).count()
        late = student_att.filter(status=Attendance.Status.LATE).count()
        excused = student_att.filter(status=Attendance.Status.EXCUSE).count()
        total_entries = present + absent + late + excused

        # Late counts as present for simple attendance percentage.
        present_equiv = present + late
        pct = round((present_equiv / total_entries) * 100, 2) if total_entries else 0
        class_present_equivalent += Decimal(str(present_equiv))

        middle = f" {enrollment.student.middle_name.strip()}" if enrollment.student.middle_name else ""
        student_name = f"{enrollment.student.first_name}{middle} {enrollment.student.last_name}".strip()
        per_student.append(
            {
                "student": enrollment.student_id,
                "student_name": student_name,
                "student_id": enrollment.student.student_id,
                "present_count": present,
                "absent_count": absent,
                "late_count": late,
                "excused_count": excused,
                "attendance_percentage": pct,
            }
        )

    total_entries_class = attendance_qs.count()
    class_attendance_percentage = (
        round(float(class_present_equivalent / Decimal(str(total_entries_class)) * Decimal("100.00")), 2)
        if total_entries_class
        else 0
    )

    return {
        "schedule": schedule.id,
        "schedule_display": f"{schedule.subject.name} - {schedule.section.name}",
        "total_students": total_students,
        "total_class_days": total_class_days,
        "present_count": attendance_qs.filter(status=Attendance.Status.PRESENT).count(),
        "absent_count": attendance_qs.filter(status=Attendance.Status.ABSENT).count(),
        "late_count": attendance_qs.filter(status=Attendance.Status.LATE).count(),
        "excused_count": attendance_qs.filter(status=Attendance.Status.EXCUSE).count(),
        "class_attendance_percentage": class_attendance_percentage,
        "students": per_student,
    }


def summarize_class_performance(user, schedule_id, grade_period_id):
    base = apply_records_filters(
        get_records_queryset_for_user(user),
        {"schedule": schedule_id, "grade_period": grade_period_id},
    )
    records = list(base)
    if not records:
        return {
            "total_students": 0,
            "passed_count": 0,
            "failed_count": 0,
            "incomplete_count": 0,
            "class_average": 0,
            "highest_grade": 0,
            "lowest_grade": 0,
            "grade_distribution": {"90-100": 0, "85-89": 0, "80-84": 0, "75-79": 0, "Below 75": 0},
        }

    passed = 0
    failed = 0
    incomplete = 0
    graded_values = []
    distribution = {"90-100": 0, "85-89": 0, "80-84": 0, "75-79": 0, "Below 75": 0}

    for item in records:
        remark = str(item.remarks or "").strip().lower()
        if remark == "incomplete":
            incomplete += 1
            continue
        if item.final_grade is None:
            incomplete += 1
            continue

        grade = float(item.final_grade)
        graded_values.append(grade)
        if grade >= 75:
            passed += 1
        else:
            failed += 1

        if grade >= 90:
            distribution["90-100"] += 1
        elif grade >= 85:
            distribution["85-89"] += 1
        elif grade >= 80:
            distribution["80-84"] += 1
        elif grade >= 75:
            distribution["75-79"] += 1
        else:
            distribution["Below 75"] += 1

    class_average = round(sum(graded_values) / len(graded_values), 2) if graded_values else 0
    highest = round(max(graded_values), 2) if graded_values else 0
    lowest = round(min(graded_values), 2) if graded_values else 0

    return {
        "total_students": len(records),
        "passed_count": passed,
        "failed_count": failed,
        "incomplete_count": incomplete,
        "class_average": class_average,
        "highest_grade": highest,
        "lowest_grade": lowest,
        "grade_distribution": distribution,
    }


def get_weighted_average_rows(user, schedule_id, remarks=None):
    schedule_value = str(schedule_id or "").strip()
    if not schedule_value:
        raise serializers.ValidationError({"detail": "Please select a schedule."})
    if not schedule_value.isdigit():
        raise serializers.ValidationError({"schedule": "schedule must be a valid id."})

    schedule = Schedule.objects.filter(id=int(schedule_value), user=user).first()
    if schedule is None:
        raise serializers.ValidationError({"detail": "Please select a schedule."})

    periods = list(
        Period.objects.filter(
            user=user,
            time_start__isnull=True,
            time_end__isnull=True,
        ).order_by("position", "id")
    )
    if not periods:
        return []

    enrollments = list(
        Record.objects.select_related("student")
        .filter(schedule=schedule, is_active=True, grade_period__isnull=True)
        .order_by("student__last_name", "student__first_name", "id")
    )
    if not enrollments:
        return []

    records = list(
        Record.objects.filter(
            schedule=schedule,
            grade_period_id__in=[p.id for p in periods],
            is_active=True,
        ).select_related("grade_period")
    )
    period_key_by_name = {str(p.name or "").strip().lower(): p.id for p in periods}
    period_weights = {p.id: _safe_decimal(p.weight) for p in periods}
    rec_map = {(r.student_id, r.grade_period_id): r for r in records}

    prelim_id = period_key_by_name.get("prelim")
    midterm_id = period_key_by_name.get("midterm")
    prefinal_id = period_key_by_name.get("prefinal")
    final_id = period_key_by_name.get("final")

    rows = []
    for enrollment in enrollments:
        student = enrollment.student
        weighted_total = Decimal("0.00")
        has_missing_or_incomplete = False

        period_grades = {}
        for period in periods:
            rec = rec_map.get((student.id, period.id))
            if rec is None or rec.final_grade is None:
                period_grades[period.id] = None
                has_missing_or_incomplete = True
                continue
            period_grades[period.id] = float(rec.final_grade)
            if str(rec.remarks or "").strip().lower() == "incomplete":
                has_missing_or_incomplete = True
                continue
            weight = period_weights[period.id]
            weighted_total += (_safe_decimal(rec.final_grade) * weight) / Decimal("100.00")

        overall_decimal = weighted_total.quantize(Decimal("0.01"))
        overall = float(overall_decimal)
        if has_missing_or_incomplete:
            overall_remarks = "Incomplete"
        else:
            overall_remarks = "Passed" if overall >= 75 else "Failed"

        if remarks and str(remarks).strip():
            if overall_remarks.lower() != str(remarks).strip().lower():
                continue

        middle = f" {student.middle_name.strip()}" if student.middle_name else ""
        student_name = f"{student.first_name}{middle} {student.last_name}".strip()
        rows.append(
            {
                "student": student.id,
                "student_name": student_name,
                "student_id": student.student_id,
                "prelim_grade": period_grades.get(prelim_id),
                "midterm_grade": period_grades.get(midterm_id),
                "prefinal_grade": period_grades.get(prefinal_id),
                "final_grade": period_grades.get(final_id),
                "overall_average_grade": overall,
                "overall_remarks": overall_remarks,
                "remarks": overall_remarks,
            }
        )

    return rows
