# EduTrack – Grading and Attendance Management System

## Project Overview
EduTrack is a teacher-focused academic operations platform built with Django and Django REST Framework. It centralizes attendance tracking, assessment management, grade computation, student enrollment, and academic reporting behind an API-driven backend, with a lightweight Django-template frontend for day-to-day use.

This repository is positioned as a serious backend portfolio project: it demonstrates authentication, authorization, relational database design, service-layer business logic, workflow validation, and REST API design in a real-world education domain.

## Architecture Pattern

EduTrack follows a layered architecture that separates request handling, validation, business logic, and persistence concerns. This keeps workflows maintainable and prevents business rules from being tightly coupled to API views.

## Why This Project Matters
Academic systems are deceptively complex. Attendance, schedules, assessments, grade periods, and student records all depend on one another, and weak backend design quickly leads to inconsistent data. EduTrack matters because it models those relationships explicitly and enforces business rules such as:

- teacher-scoped access to records
- active school-term and grade-period constraints
- duplicate prevention for schedules, enrollments, and academic records
- repeatable grade computation and report generation workflows

## Project Highlights
- **JWT-based authentication and authorization** for protected academic workflows
- **Attendance, grading, assessment, and academic record workflows** modeled around real classroom operations
- **REST API architecture built with Django REST Framework** for modular domain endpoints
- **Service-layer business logic and relational database design** that keeps workflow rules out of request handlers
- Supports **teacher onboarding**, **password reset**, and authenticated account management
- Uses a **layered backend structure**: API views, serializers, services, models, and route modules
- Encodes business rules in a dedicated **service layer** instead of scattering logic across views
- Uses a relational schema designed for growth; the repo currently runs on **SQLite for development** and includes **`mysqlclient`** for MySQL-oriented deployment paths

## Tech Stack
| Layer | Technology |
| --- | --- |
| Backend framework | Django 6.0.3 |
| API layer | Django REST Framework |
| Authentication | `djangorestframework-simplejwt` |
| Database | SQLite in local development, MySQL-ready dependency via `mysqlclient` |
| Frontend | Django templates, vanilla JavaScript, custom CSS |
| Cross-origin support | `django-cors-headers` |
| Runtime | Python 3.12+ |

## System Architecture
EduTrack follows a layered architecture with separation of concerns across API views, serializers, services, and models.

Its backend structure is inspired by common MVC-style service-layer patterns while staying idiomatic to Django. Responsibilities are split so request handling, validation, business logic, and persistence remain isolated and easier to maintain.

```text
Browser UI
      ↓
Django Templates / JavaScript
      ↓
DRF API Views
      ↓
Serializers (Validation)
      ↓
Services (Business Logic)
      ↓
Models (Domain Entities)
      ↓
Database
```

The codebase is organized by domain and by responsibility. Route modules in `apps/urls/` expose clear API areas, serializers validate input and normalize output, and services contain the rules that keep academic workflows consistent.

## Core Features
- Teacher account registration, login, logout, password reset, and profile retrieval
- School-year and grading-period setup
- Subject, section, and class schedule management
- Student registration and schedule enrollment
- Attendance recording with summaries and class-level reporting
- Assessment creation, score entry, weighted grade computation, and persisted academic records
- CSV export and summary endpoints for reports

## Authentication and Authorization
- JWT is the primary API authentication mechanism for the application frontend.
- The auth API includes login, registration, token refresh, logout, current-user lookup, and password reset request/confirm flows.
- Protected API areas use `IsAuthenticated`, and most domain queries are scoped to `request.user` so teachers only work with their own schedules, templates, school years, and reports.
- The frontend keeps the access token in memory and uses a refresh token for session continuity, reducing repeated login friction while preserving an API-first flow.

## Attendance Management
- Attendance records are tied to a student enrollment record and class schedule.
- Supported statuses include **Present**, **Absent**, **Late**, and **Excuse**.
- The backend supports single-record writes and **bulk attendance save** for faster classroom workflows.
- Summary endpoints provide per-student attendance metrics and class-level attendance reporting by schedule.
- Attendance updates are restricted when a schedule belongs to an inactive school term.

## Grading System Features
- Teachers can define reusable **grading templates** made up of weighted components that must total **100%**.
- Assessments are linked to a schedule, grade period, and grading component.
- Score entry is supported at the assessment level, including bulk score submission.
- Grade computation produces a component-by-component breakdown, final grade, and remarks, and can either preview or persist results.
- Weighted average reporting combines stored period grades into an overall schedule-level academic summary.

## Student Management Features
- Manage **subjects**, **sections**, **students**, and **student enrollments** through dedicated API areas.
- Students are linked to sections and year levels, and enrollments connect students to schedules.
- Validation rules prevent duplicate student IDs, incompatible section assignments, duplicate active enrollments, and time-conflicting schedule enrollments.
- Deletion rules protect the integrity of existing attendance, score, and record history.

## Reports and Academic Records
- Computed grades are stored as academic records rather than recalculated on every page load.
- Records include component breakdown data, computed timestamps, remarks, and lock-ready fields.
- Reporting endpoints cover:
  - attendance summaries by schedule
  - class performance statistics by grade period
  - weighted averages across grading periods

## API and Backend Design
EduTrack is intentionally API-driven. The backend is not just a page renderer with form handlers; it exposes domain-specific endpoints that support both the current UI and future client extensions.

- `apps/api/` contains DRF API views
- `apps/serializers/` handles validation and response formatting
- `apps/services/` contains workflow and business logic
- `apps/models/` defines the relational data model
- `apps/urls/` separates routing by domain area

This structure makes the codebase easier to reason about, test, and extend than a view-heavy Django application with business logic embedded directly in request handlers.

## Project Structure
```text
grading-system/
├── apps/
│   ├── api/                # DRF API views by domain
│   ├── models/             # relational data model
│   ├── serializers/        # validation + response shaping
│   ├── services/           # business rules and workflows
│   └── urls/               # modular route definitions
├── config/                 # Django project settings and root URL config
├── templates/              # login, dashboard, and page sections
├── static/                 # frontend JavaScript and CSS
├── manage.py
├── requirements.txt
└── README.md
```

## Installation Guide
```bash
git clone https://github.com/CrushieT/grading-system.git
cd grading-system
git checkout develop

python -m venv venv
```

Activate the virtual environment:

```bash
# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

Install dependencies and start the project:

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open:

- `http://127.0.0.1:8000`
- or directly `http://127.0.0.1:8000/login.html`

## First-Time Setup
The recommended first-run path is the in-app onboarding flow rather than creating a Django superuser.

1. Start the server and open `http://127.0.0.1:8000/login.html`
2. Select **Create an account**
3. Enter teacher profile details
4. Complete school setup with:
   - institution name
   - school year
   - default grading profile
5. Sign in and configure subjects, sections, schedules, students, assessments, and attendance

Optional admin access:

```bash
python manage.py createsuperuser
```

Then visit `http://127.0.0.1:8000/admin/`.

If you want password reset emails to work locally, create a `.env` file and provide the mail settings used in `config/settings.py`, such as `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL`.

## Main API Areas
| Area | Representative endpoints |
| --- | --- |
| Auth | `/api/auth/login/`, `/api/auth/register/`, `/api/auth/me/`, `/api/auth/refresh/`, `/api/auth/password-reset/*` |
| School setup | `/api/school-years/`, `/api/semesters/`, `/api/school-year-semesters/`, `/api/grade-periods/` |
| Student domain | `/api/subjects/`, `/api/sections/`, `/api/students/`, `/api/student-enrollments/` |
| Scheduling | `/api/periods/`, `/api/schedules/` |
| Assessments | `/api/assessments/`, `/api/assessments/{id}/scores/`, `/api/schedules/{id}/grading-components/` |
| Attendance | `/api/attendance/`, `/api/attendance/bulk-save/`, `/api/attendance/summary/` |
| Grading and reports | `/api/grades/compute/`, `/api/grades/recompute/`, `/api/records/`, `/api/records/export/`, `/api/reports/*` |

## Security Notes
- Protected API endpoints require authentication and are generally scoped to the currently logged-in teacher.
- Password reset requests return a generic success message, which helps reduce account-enumeration leakage.
- The frontend auth flow keeps the access token out of long-term browser storage and relies on refresh-token-based session continuity.
- Several write operations enforce ownership, active school term, and active grade-period checks before mutating data.
- This repository is currently configured with development-oriented defaults and should be hardened before production deployment.
- Production readiness work would include stricter host and environment configuration, hardened secret management, tighter CORS and email settings, and a production database configuration strategy.

## Future Improvements
- Move database configuration fully into environment variables and add first-class MySQL deployment settings
- Add automated API and service-layer tests
- Introduce stronger role-based permissions beyond the current teacher-centric flow
- Publish OpenAPI / Swagger documentation
- Add Docker and CI support for repeatable local and deployment workflows
- Harden production settings for secrets, hosts, CORS, and email delivery

## Developer Information
- **Project name:** EduTrack – Grading and Attendance Management System
- **Primary focus:** backend architecture, API design, authentication, relational data modeling, and academic workflow management
- **Repository:** `https://github.com/CrushieT/grading-system`
- **Note:** Some interface text in the current implementation still uses the earlier working name **GradeDesk**

EduTrack is best understood as a backend-focused product build: not a generic school exercise, but a practical Django system that demonstrates how to structure authenticated APIs, model domain workflows, and maintain data integrity across interconnected academic operations.
