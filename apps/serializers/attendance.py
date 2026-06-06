from rest_framework import serializers

from apps.models import Attendance, Schedule, Student
from apps.services.attendance_service import (
    build_day_time_from_date,
    ensure_no_duplicate_attendance,
    get_record_for_student_schedule_for_user,
    normalize_attendance_date,
    normalize_attendance_status,
    resolve_schedule_for_user,
    resolve_student_for_user,
)


class AttendanceSerializer(serializers.ModelSerializer):
    student = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.all(),
        write_only=True,
        required=False,
    )
    schedule = serializers.PrimaryKeyRelatedField(
        queryset=Schedule.objects.all(),
        write_only=True,
        required=False,
    )
    date = serializers.DateField(write_only=True, required=False)
    student_name = serializers.SerializerMethodField()
    schedule_label = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = [
            "id",
            "student",
            "student_name",
            "schedule",
            "schedule_label",
            "date",
            "status",
        ]
        read_only_fields = ["id", "student_name", "schedule_label"]

    def get_student_name(self, obj):
        student = obj.record.student
        middle = f" {student.middle_name.strip()}" if student.middle_name else ""
        return f"{student.first_name}{middle} {student.last_name}".strip()

    def get_schedule_label(self, obj):
        schedule = obj.record.schedule
        subject = schedule.subject.name
        section = schedule.section.name
        day = schedule.day or "-"
        return f"{subject} - {section} ({day})"

    def validate(self, attrs):
        request = self.context.get("request")
        if not request:
            raise serializers.ValidationError("User context is required.")

        instance = self.instance
        student_value = attrs.get("student", instance.record.student if instance else None)
        schedule_value = attrs.get("schedule", instance.record.schedule if instance else None)
        date_value = attrs.get("date", instance.day_time.date() if instance else None)
        status_value = attrs.get("status", instance.status if instance else None)

        if student_value is None:
            raise serializers.ValidationError({"student": "student is required."})
        if schedule_value is None:
            raise serializers.ValidationError({"schedule": "schedule is required."})
        if date_value is None:
            raise serializers.ValidationError({"date": "date is required."})
        if status_value in (None, ""):
            raise serializers.ValidationError({"status": "status is required."})

        student = resolve_student_for_user(request.user, student_value)
        schedule = resolve_schedule_for_user(request.user, schedule_value, require_active=True)
        record = get_record_for_student_schedule_for_user(request.user, student, schedule)
        target_date = normalize_attendance_date(date_value)
        normalized_status = normalize_attendance_status(status_value)
        ensure_no_duplicate_attendance(
            record=record,
            target_date=target_date,
            exclude_id=instance.id if instance else None,
        )

        attrs["record"] = record
        attrs["day_time"] = build_day_time_from_date(target_date)
        attrs["status"] = normalized_status
        attrs.pop("student", None)
        attrs.pop("schedule", None)
        attrs.pop("date", None)
        return attrs

    def update(self, instance, validated_data):
        for field in ("record", "day_time", "status"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save(update_fields=["record", "day_time", "status"])
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["student"] = instance.record.student_id
        data["schedule"] = instance.record.schedule_id
        data["date"] = instance.day_time.date().isoformat()
        return data
