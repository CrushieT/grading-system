from rest_framework import serializers

from apps.models import SchoolYearSemester, Section, Subject
from apps.services.students_service import (
    validate_section_name_unique,
    validate_subject_code_unique,
)


class SubjectSerializer(serializers.ModelSerializer):
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
            raise serializers.ValidationError({"units": "Units is required."})
        if units <= 0:
            raise serializers.ValidationError({"units": "Units must be greater than 0."})

        validate_subject_code_unique(
            user=user,
            code=code,
            exclude_id=instance.id if instance else None,
        )

        attrs["code"] = code
        attrs["name"] = name
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if not request:
            raise serializers.ValidationError("User context is required.")
        return Subject.objects.create(user=request.user, **validated_data)


class SectionSerializer(serializers.ModelSerializer):
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
        school_year = obj.school_year_sem.school_year.name
        semester = obj.school_year_sem.semester.name
        return f"{school_year} - {semester}"

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
